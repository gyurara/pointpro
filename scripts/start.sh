#!/usr/bin/env bash
# PetChain 전체 스택 시작/종료 스크립트
#
# 전제:
#   - MySQL 8.0 이 로컬에 설치되어 있어야 함 (Docker 아님)
#   - Java 17+ 설치
#   - Node.js 18+ 설치 (nvm 포함)
#
# 사용법:
#   bash scripts/start.sh              # MySQL + 백엔드 + 프론트엔드 시작
#   bash scripts/start.sh --chain      # 위 + Fabric 체인코드 배포 포함
#   bash scripts/start.sh --down       # 전체 종료
#   bash scripts/start.sh --restart    # 재시작
#   bash scripts/start.sh --logs       # 실시간 로그 보기 (Ctrl+C 로 빠져나옴)
#   bash scripts/start.sh --status     # 실행 상태 확인
#   bash scripts/start.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BE_DIR="${PROJECT_DIR}/be/backend"
FE_DIR="${PROJECT_DIR}/fe/petchain"

PID_DIR="/tmp/petchain-pids"
LOG_DIR="/tmp/petchain-logs"
BE_PID="${PID_DIR}/backend.pid"
FE_PID="${PID_DIR}/frontend.pid"
BE_LOG="${LOG_DIR}/backend.log"
FE_LOG="${LOG_DIR}/frontend.log"

export FABRIC_SAMPLES_DIR="${FABRIC_SAMPLES_DIR:-$HOME/fabric-samples}"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR ]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── 도움말 ────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF

${BOLD}PetChain 전체 스택 시작 스크립트${NC}

  MySQL은 로컬 설치본을 사용합니다 (Docker 아님).
  백엔드(Spring Boot)와 프론트엔드(Vite)는 네이티브로 실행됩니다.

사용법:
  bash scripts/start.sh [옵션]

옵션:
  (없음)      MySQL 서비스 시작 + 백엔드 + 프론트엔드
  --chain     위 + Hyperledger Fabric 체인코드 배포 및 연동
  --down      전체 종료 (프로세스 + 선택적으로 Fabric)
  --restart   전체 종료 후 재시작
  --logs      백엔드/프론트 로그 실시간 출력 (Ctrl+C 로 종료)
  --status    실행 중인 프로세스 상태 확인
  --help      이 도움말 출력

로그 파일:
  백엔드:     ${BE_LOG}
  프론트엔드: ${FE_LOG}

EOF
}

# ── 전제 조건 확인 ────────────────────────────────────────────────────────────
check_prereqs() {
    local ok=true

    if ! command -v java &>/dev/null; then
        error "Java가 설치되어 있지 않습니다. Java 17+ 필요."
        ok=false
    fi

    if ! command -v node &>/dev/null; then
        # nvm 경로 직접 탐색
        for nvm_node in "$HOME/.nvm/versions/node"/*/bin/node; do
            if [[ -x "$nvm_node" ]]; then
                export PATH="$(dirname "$nvm_node"):$PATH"
                break
            fi
        done
        if ! command -v node &>/dev/null; then
            error "Node.js가 설치되어 있지 않습니다. Node 18+ 필요."
            ok=false
        fi
    fi

    if ! command -v mysqladmin &>/dev/null && ! command -v mysql &>/dev/null; then
        warn "MySQL 클라이언트를 찾을 수 없습니다. MySQL 설치 여부를 확인하세요."
    fi

    if ! $ok; then
        die "필수 도구를 설치한 후 다시 실행하세요."
    fi
}

# ── .env 파일 확인 및 초기 생성 ──────────────────────────────────────────────
ensure_env() {
    if [[ ! -f "${PROJECT_DIR}/.env" ]]; then
        warn ".env 파일이 없습니다. .env.example 에서 복사합니다."
        cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
        echo ""
        warn "⚠️  .env 를 열어 DB_PASSWORD, JWT_SECRET, ADMIN_PASSWORD 를 확인/수정하세요."
        warn "    기본값으로 계속 진행합니다..."
        echo ""
    fi
    # .env 에서 변수 로드 (export)
    set -a
    # shellcheck disable=SC1090
    source "${PROJECT_DIR}/.env" 2>/dev/null || true
    set +a
}

# ── MySQL 서비스 시작 ─────────────────────────────────────────────────────────
start_mysql() {
    info "로컬 MySQL 상태 확인 중..."

    # 이미 실행 중이면 스킵
    if mysqladmin ping --silent 2>/dev/null; then
        success "MySQL 이미 실행 중"
        return
    fi

    info "MySQL 서비스 시작 중..."
    if sudo systemctl start mysql 2>/dev/null; then
        success "MySQL 시작 완료 (systemctl)"
    elif sudo service mysql start 2>/dev/null; then
        success "MySQL 시작 완료 (service)"
    else
        die "MySQL 시작 실패. 수동으로 시작하세요: sudo systemctl start mysql"
    fi

    # 최대 15초 대기
    local waited=0
    while ! mysqladmin ping --silent 2>/dev/null; do
        if [[ $waited -ge 15 ]]; then
            die "MySQL이 15초 안에 응답하지 않습니다."
        fi
        sleep 1
        ((waited++))
    done
    success "MySQL 연결 확인 완료"
}

# ── 백엔드 시작 ───────────────────────────────────────────────────────────────
start_backend() {
    if is_running "${BE_PID}"; then
        warn "백엔드가 이미 실행 중입니다. (PID: $(cat "$BE_PID"))"
        return
    fi

    info "백엔드 시작 중 (Spring Boot)..."
    mkdir -p "${PID_DIR}" "${LOG_DIR}"

    (
        cd "${BE_DIR}"
        # .env 에서 읽은 변수들을 그대로 전달
        export DB_HOST="${DB_HOST:-localhost}"
        export DB_PORT="${DB_PORT:-3306}"
        export DB_NAME="${DB_NAME:-petchain}"
        export DB_USERNAME="${DB_USERNAME:-root}"
        export DB_PASSWORD="${DB_PASSWORD:-1234}"
        export JWT_SECRET="${JWT_SECRET:-petchain-jwt-secret-key-must-be-at-least-256-bits-long-for-hs256-algo}"
        export ADMIN_LOGIN_ID="${ADMIN_LOGIN_ID:-admin}"
        export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234}"
        export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-}"
        export SERVER_PORT="${SERVER_PORT:-8080}"
        export FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
        export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:5173}"
        # 체인코드 설정 전달
        export CHAIN_ENABLED="${CHAIN_ENABLED:-false}"
        export CHAIN_MSP_ID="${CHAIN_MSP_ID:-Org1MSP}"
        export CHAIN_CHANNEL="${CHAIN_CHANNEL:-petchannel}"
        export CHAIN_CHAINCODE="${CHAIN_CHAINCODE:-petchain}"
        export CHAIN_PEER_ENDPOINT="${CHAIN_PEER_ENDPOINT:-localhost:7051}"
        export CHAIN_PEER_HOST_OVERRIDE="${CHAIN_PEER_HOST_OVERRIDE:-peer0.org1.example.com}"
        export CHAIN_TLS_CERT_PATH="${CHAIN_TLS_CERT_PATH:-}"
        export CHAIN_CERT_PATH="${CHAIN_CERT_PATH:-}"
        export CHAIN_KEY_DIR="${CHAIN_KEY_DIR:-}"

        ./gradlew bootRun --no-daemon -q 2>&1
    ) >> "${BE_LOG}" 2>&1 &

    echo $! > "${BE_PID}"
    success "백엔드 시작됨 (PID: $!, 로그: ${BE_LOG})"
}

# ── 프론트엔드 시작 ───────────────────────────────────────────────────────────
start_frontend() {
    if is_running "${FE_PID}"; then
        warn "프론트엔드가 이미 실행 중입니다. (PID: $(cat "$FE_PID"))"
        return
    fi

    info "프론트엔드 시작 중 (Vite)..."
    mkdir -p "${PID_DIR}" "${LOG_DIR}"

    # node_modules 없으면 먼저 설치
    if [[ ! -d "${FE_DIR}/node_modules" ]]; then
        info "npm 패키지 설치 중..."
        (cd "${FE_DIR}" && npm install --silent) 2>&1 | tail -3
    fi

    (
        cd "${FE_DIR}"
        npm run dev 2>&1
    ) >> "${FE_LOG}" 2>&1 &

    echo $! > "${FE_PID}"
    success "프론트엔드 시작됨 (PID: $!, 로그: ${FE_LOG})"
}

# ── 프로세스 생존 확인 ────────────────────────────────────────────────────────
is_running() {
    local pid_file="$1"
    [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

# ── 프로세스 종료 ─────────────────────────────────────────────────────────────
kill_proc() {
    local pid_file="$1"
    local name="$2"
    if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            info "${name} 종료 중 (PID: ${pid})..."
            kill "$pid" 2>/dev/null || true
            # gradlew 는 자식 프로세스를 남길 수 있으므로 프로세스 그룹 종료
            kill -- -"$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$pid_file"
        success "${name} 종료됨"
    fi
}

# ── Fabric 시작 ───────────────────────────────────────────────────────────────
start_chain() {
    echo ""
    info "Hyperledger Fabric 체인코드 배포 시작..."
    bash "${SCRIPT_DIR}/chaincode-deploy.sh" deploy

    # 배포 완료 후 .env 에 CHAIN_ENABLED=true 와 경로 설정 주입
    local org1="${FABRIC_SAMPLES_DIR}/test-network/organizations/peerOrganizations/org1.example.com"
    local tls_cert="${org1}/peers/peer0.org1.example.com/tls/ca.crt"
    local cert="${org1}/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem"
    local key_dir="${org1}/users/Admin@org1.example.com/msp/keystore"

    if [[ -f "${tls_cert}" ]]; then
        # .env 에 CHAIN_* 항목 자동 업데이트
        update_env "CHAIN_ENABLED" "true"
        update_env "CHAIN_PEER_ENDPOINT" "localhost:7051"
        update_env "CHAIN_TLS_CERT_PATH" "${tls_cert}"
        update_env "CHAIN_CERT_PATH" "${cert}"
        update_env "CHAIN_KEY_DIR" "${key_dir}"
        success ".env 의 CHAIN_* 설정이 자동으로 업데이트되었습니다."
    else
        warn "Fabric 인증서를 찾지 못해 .env 를 수동으로 설정해야 합니다."
    fi
}

# ── Fabric 종료 ───────────────────────────────────────────────────────────────
stop_chain() {
    local fabric_network="${FABRIC_SAMPLES_DIR}/test-network"
    if [[ -d "${fabric_network}" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "peer0.org1\|orderer"; then
        info "Fabric 네트워크 종료 중..."
        (cd "${fabric_network}" && ./network.sh down 2>/dev/null) || true
        rm -rf /tmp/petchain-cc-demo
        success "Fabric 종료 완료"
    fi
}

# ── .env 값 업데이트 (없으면 추가, 있으면 교체) ──────────────────────────────
update_env() {
    local key="$1"
    local value="$2"
    local env_file="${PROJECT_DIR}/.env"
    if grep -q "^${key}=" "${env_file}" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "${env_file}"
    else
        echo "${key}=${value}" >> "${env_file}"
    fi
}

# ── 백엔드 HTTP 응답 대기 ─────────────────────────────────────────────────────
wait_for_backend() {
    local port="${SERVER_PORT:-8080}"
    local waited=0
    local max=60

    echo -n "백엔드 응답 대기 중"
    while ! curl -sf "http://localhost:${port}/actuator/health" &>/dev/null && \
          ! curl -sf "http://localhost:${port}/api/auth/login" &>/dev/null; do
        if ! is_running "${BE_PID}"; then
            echo ""
            error "백엔드 프로세스가 예기치 않게 종료되었습니다."
            error "로그를 확인하세요: tail -50 ${BE_LOG}"
            return 1
        fi
        if [[ $waited -ge $max ]]; then
            echo ""
            warn "백엔드가 ${max}초 내에 응답하지 않습니다. 계속 기다리려면 로그를 확인하세요."
            return 0
        fi
        echo -n "."
        sleep 2
        ((waited+=2))
    done
    echo ""
    success "백엔드 응답 확인 (http://localhost:${port})"
}

# ── 접속 정보 출력 ────────────────────────────────────────────────────────────
print_urls() {
    local be_port="${SERVER_PORT:-8080}"
    local fe_port=5173

    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e " 접속 주소"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${GREEN}프론트엔드${NC}  http://localhost:${fe_port}"
    echo -e "  ${GREEN}백엔드 API${NC}  http://localhost:${be_port}/api"
    echo ""
    echo -e " 유용한 명령어"
    echo -e "  로그 보기:   bash scripts/start.sh --logs"
    echo -e "  상태 확인:   bash scripts/start.sh --status"
    echo -e "  종료:        bash scripts/start.sh --down"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ── 상태 확인 ─────────────────────────────────────────────────────────────────
show_status() {
    echo ""
    echo -e "${BOLD}── 서비스 상태 ─────────────────────────────────────────────────${NC}"

    # MySQL
    if mysqladmin ping --silent 2>/dev/null; then
        echo -e "  MySQL      ${GREEN}● 실행 중${NC} (localhost:${DB_PORT:-3306})"
    else
        echo -e "  MySQL      ${RED}○ 중지됨${NC}"
    fi

    # 백엔드
    if is_running "${BE_PID}"; then
        echo -e "  백엔드     ${GREEN}● 실행 중${NC} (PID: $(cat "$BE_PID"), :${SERVER_PORT:-8080})"
    else
        echo -e "  백엔드     ${RED}○ 중지됨${NC}"
    fi

    # 프론트엔드
    if is_running "${FE_PID}"; then
        echo -e "  프론트     ${GREEN}● 실행 중${NC} (PID: $(cat "$FE_PID"), :5173)"
    else
        echo -e "  프론트     ${RED}○ 중지됨${NC}"
    fi

    # Fabric
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "peer0.org1\|orderer"; then
        echo -e "  Fabric     ${GREEN}● 실행 중${NC} (petchannel)"
    else
        echo -e "  Fabric     ${YELLOW}○ 미사용${NC}"
    fi

    echo ""
}

# ── 로그 스트리밍 ─────────────────────────────────────────────────────────────
stream_logs() {
    echo -e "${BOLD}로그 스트림 (Ctrl+C 로 종료)${NC}"
    echo -e "${CYAN}── 백엔드 ──────────────────────────────${NC}  ${YELLOW}── 프론트엔드 ───────────────────────${NC}"
    echo ""
    tail -f "${BE_LOG}" "${FE_LOG}" 2>/dev/null || {
        warn "로그 파일이 없습니다. 먼저 start.sh 로 서비스를 시작하세요."
    }
}

# ── 전체 종료 ─────────────────────────────────────────────────────────────────
stop_all() {
    local with_chain="${1:-false}"
    echo ""
    info "전체 스택 종료 중..."
    kill_proc "${FE_PID}" "프론트엔드"
    kill_proc "${BE_PID}" "백엔드"
    if $with_chain; then
        stop_chain
    fi
    # gradlew 데몬도 정리
    "${BE_DIR}/gradlew" --stop 2>/dev/null || true
    success "종료 완료"
    echo ""
}

# ── 메인 ──────────────────────────────────────────────────────────────────────
main() {
    local with_chain=false
    local action="start"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --chain)   with_chain=true ;;
            --down)    action="down" ;;
            --restart) action="restart" ;;
            --logs)    action="logs" ;;
            --status)  action="status" ;;
            --help|-h) usage; exit 0 ;;
            *) die "알 수 없는 옵션: $1  (--help 참고)" ;;
        esac
        shift
    done

    case "${action}" in

        # ── 시작 ──────────────────────────────────────────────────────────────
        start)
            echo ""
            echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${BOLD} PetChain 스택 시작${NC}"
            if $with_chain; then
                echo -e " 모드: ${GREEN}풀 스택 (MySQL + 백엔드 + 프론트 + Fabric 체인코드)${NC}"
            else
                echo -e " 모드: ${CYAN}앱 스택 (MySQL + 백엔드 + 프론트엔드, 오프체인)${NC}"
            fi
            echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""

            check_prereqs
            ensure_env
            start_mysql

            if $with_chain; then
                start_chain
                # .env 재로드 (CHAIN_* 업데이트 반영)
                set -a; source "${PROJECT_DIR}/.env" 2>/dev/null || true; set +a
            fi

            start_backend
            start_frontend

            echo ""
            info "서비스가 백그라운드에서 시작되었습니다. 준비까지 잠시 기다려 주세요..."
            wait_for_backend || true

            print_urls
            ;;

        # ── 종료 ──────────────────────────────────────────────────────────────
        down)
            stop_all $with_chain
            ;;

        # ── 재시작 ────────────────────────────────────────────────────────────
        restart)
            stop_all $with_chain
            ensure_env
            start_mysql

            if $with_chain; then
                start_chain
                set -a; source "${PROJECT_DIR}/.env" 2>/dev/null || true; set +a
            fi

            start_backend
            start_frontend
            wait_for_backend || true
            print_urls
            ;;

        # ── 로그 ──────────────────────────────────────────────────────────────
        logs)
            stream_logs
            ;;

        # ── 상태 ──────────────────────────────────────────────────────────────
        status)
            ensure_env
            show_status
            ;;

    esac
}

main "$@"
