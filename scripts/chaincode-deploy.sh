#!/usr/bin/env bash
# PetChain 체인코드 자동 배포 스크립트
# fabric-samples/test-network 기반 데모 환경 구성
#
# 사용법:
#   bash scripts/chaincode-deploy.sh          # 배포
#   bash scripts/chaincode-deploy.sh --down   # 네트워크 종료
#   bash scripts/chaincode-deploy.sh --status # 배포 상태 확인
#   bash scripts/chaincode-deploy.sh --env    # 백엔드 환경변수만 출력
#   bash scripts/chaincode-deploy.sh --help   # 도움말
#
# 전제 조건:
#   - Docker, Docker Compose
#   - Go 1.16+
#   - Hyperledger Fabric 바이너리 (peer, cryptogen 등)
#   - fabric-samples (없으면 자동 다운로드)

set -euo pipefail

# ── 설정 ──────────────────────────────────────────────────────────────────────
CHANNEL_NAME="petchannel"
CC_NAME="petchain"
CC_VERSION="1.0"
CC_SEQUENCE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CC_SRC="${PROJECT_DIR}/chaincode/petchain"

FABRIC_SAMPLES_DIR="${FABRIC_SAMPLES_DIR:-$HOME/fabric-samples}"
FABRIC_NETWORK="${FABRIC_SAMPLES_DIR}/test-network"
FABRIC_BIN="${FABRIC_SAMPLES_DIR}/bin"

# 데모용 MSP 매핑 (test-network 기본 MSP → 체인코드 MSP 상수)
# Org1 = 플랫폼(Platform) + 병원(Hospital) 역할
# Org2 = 보험사A + 보험사B 역할
DEMO_MSP_MAP=(
    "s/PlatformOrgMSP/Org1MSP/g"
    "s/HospitalOrgMSP/Org2MSP/g"
    "s/InsuranceAOrgMSP/Org2MSP/g"
    "s/InsuranceBOrgMSP/Org2MSP/g"
    "s/InsurerOrgMSP/Org2MSP/g"
)

CC_DEMO_TMP="/tmp/petchain-cc-demo"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; }
die()     { error "$*"; exit 1; }

# ── 도움말 ────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
PetChain 체인코드 배포 자동화 스크립트

사용법:
  bash scripts/chaincode-deploy.sh [옵션]

옵션:
  (없음)     네트워크 시작 + 체인코드 배포
  --down     Fabric 네트워크 종료
  --status   배포 상태 확인
  --env      백엔드 연결 환경변수 출력
  --help     이 도움말 출력

환경변수:
  FABRIC_SAMPLES_DIR   fabric-samples 경로 (기본: ~/fabric-samples)
  CC_VERSION           배포할 체인코드 버전 (기본: 1.0)
  CC_SEQUENCE          체인코드 시퀀스 번호 (기본: 1)

MSP 데모 매핑:
  test-network 기본 MSP와 프로젝트 MSP가 다르기 때문에 임시 복사본에서 치환 후 배포합니다.
  Org1MSP → PlatformOrgMSP, HospitalOrgMSP (백엔드가 Org1 신원으로 호출)
  Org2MSP → InsuranceAOrgMSP, InsuranceBOrgMSP

프로덕션 배포:
  MSP 이름이 일치하는 전용 Fabric 네트워크를 구성하고
  CHAIN_MSP_ID=PlatformOrgMSP 로 백엔드를 설정하세요.
EOF
}

# ── 전제 조건 확인 ────────────────────────────────────────────────────────────
check_prereqs() {
    info "전제 조건 확인 중..."

    local missing=0

    if ! command -v docker &>/dev/null; then
        error "Docker가 설치되어 있지 않습니다. https://docs.docker.com/get-docker/ 참고"
        missing=1
    fi

    if ! docker info &>/dev/null; then
        error "Docker 데몬이 실행되지 않거나 권한이 없습니다. (sudo usermod -aG docker \$USER 후 재로그인)"
        missing=1
    fi

    if ! command -v go &>/dev/null; then
        error "Go가 설치되어 있지 않습니다. https://go.dev/dl/ 참고"
        missing=1
    fi

    if [[ $missing -eq 1 ]]; then
        die "필수 도구를 먼저 설치하세요."
    fi

    success "Docker, Go 확인 완료"
}

# ── fabric-samples 설치 ───────────────────────────────────────────────────────
ensure_fabric_samples() {
    if [[ -d "${FABRIC_NETWORK}" ]]; then
        success "fabric-samples 발견: ${FABRIC_SAMPLES_DIR}"
        return
    fi

    warn "fabric-samples 를 찾을 수 없습니다. 다운로드합니다..."
    warn "시간이 걸릴 수 있습니다 (Docker 이미지 포함 약 1-2GB)."
    echo ""

    curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.9 1.5.7

    if [[ ! -d "${FABRIC_NETWORK}" ]]; then
        die "fabric-samples 다운로드 실패. 수동으로 설치 후 FABRIC_SAMPLES_DIR 환경변수를 지정하세요."
    fi

    success "fabric-samples 설치 완료"
}

# ── Fabric 바이너리를 PATH에 추가 ─────────────────────────────────────────────
setup_path() {
    if [[ -d "${FABRIC_BIN}" ]]; then
        export PATH="${FABRIC_BIN}:$PATH"
    fi

    if ! command -v peer &>/dev/null; then
        die "peer 바이너리를 찾을 수 없습니다. PATH를 확인하거나 fabric-samples/bin 이 있는지 확인하세요."
    fi

    success "Fabric 바이너리 경로 확인: peer $(peer version 2>&1 | head -1)"
}

# ── 데모용 체인코드 준비 (MSP 이름 치환) ─────────────────────────────────────
prepare_demo_chaincode() {
    info "데모용 체인코드 준비 중 (MSP 이름 치환: PlatformOrgMSP→Org1MSP 등)..."

    rm -rf "${CC_DEMO_TMP}"
    cp -r "${CC_SRC}" "${CC_DEMO_TMP}"

    # Go 소스 파일에서 MSP 상수 치환
    for go_file in "${CC_DEMO_TMP}"/*.go; do
        for rule in "${DEMO_MSP_MAP[@]}"; do
            sed -i "${rule}" "${go_file}"
        done
    done

    # 치환 확인
    if grep -q "PlatformOrgMSP\|HospitalOrgMSP\|InsuranceAOrgMSP\|InsuranceBOrgMSP\|InsurerOrgMSP" "${CC_DEMO_TMP}"/*.go; then
        warn "일부 MSP 상수가 치환되지 않았습니다. 수동 확인이 필요합니다."
    fi

    # Go 빌드 확인
    (cd "${CC_DEMO_TMP}" && go build ./...) || die "데모 체인코드 빌드 실패"

    success "데모 체인코드 준비 완료: ${CC_DEMO_TMP}"
}

# ── 테스트 네트워크 시작 ──────────────────────────────────────────────────────
start_network() {
    info "Fabric 테스트 네트워크 시작 중..."

    cd "${FABRIC_NETWORK}"
    ./network.sh down 2>/dev/null || true
    ./network.sh up createChannel -ca -c "${CHANNEL_NAME}" -s couchdb

    success "네트워크 시작 완료 (채널: ${CHANNEL_NAME})"
}

# ── 체인코드 배포 ─────────────────────────────────────────────────────────────
deploy_chaincode() {
    info "체인코드 배포 중 (이름: ${CC_NAME}, 버전: ${CC_VERSION})..."

    cd "${FABRIC_NETWORK}"
    ./network.sh deployCC \
        -c "${CHANNEL_NAME}" \
        -ccn "${CC_NAME}" \
        -ccp "${CC_DEMO_TMP}" \
        -ccl go \
        -ccv "${CC_VERSION}" \
        -ccs "${CC_SEQUENCE}"

    success "체인코드 배포 완료"
}

# ── 배포 확인 ─────────────────────────────────────────────────────────────────
verify_deployment() {
    info "배포 상태 확인 중..."

    export FABRIC_CFG_PATH="${FABRIC_NETWORK}/../config"
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID=Org1MSP
    export CORE_PEER_TLS_ROOTCERT_FILE="${FABRIC_NETWORK}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${FABRIC_NETWORK}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
    export CORE_PEER_ADDRESS=localhost:7051

    peer lifecycle chaincode querycommitted \
        --channelID "${CHANNEL_NAME}" \
        --name "${CC_NAME}" \
        --output json 2>/dev/null | python3 -m json.tool 2>/dev/null || \
    peer lifecycle chaincode querycommitted \
        --channelID "${CHANNEL_NAME}" \
        --name "${CC_NAME}" 2>/dev/null || \
    warn "배포 상태 조회 실패 (네트워크가 완전히 시작되지 않았을 수 있습니다)"

    success "배포 상태 확인 완료"
}

# ── 백엔드 환경변수 출력 ──────────────────────────────────────────────────────
print_env() {
    local org1_cert_dir="${FABRIC_NETWORK}/organizations/peerOrganizations/org1.example.com"
    local admin_cert="${org1_cert_dir}/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem"
    local admin_key_dir="${org1_cert_dir}/users/Admin@org1.example.com/msp/keystore"
    local tls_cert="${org1_cert_dir}/peers/peer0.org1.example.com/tls/ca.crt"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo " 백엔드 체인코드 연결 환경변수 (.env 또는 docker-compose.yml 에 추가)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat <<EOF
CHAIN_ENABLED=true
CHAIN_MSP_ID=Org1MSP
CHAIN_CHANNEL=${CHANNEL_NAME}
CHAIN_CHAINCODE=${CC_NAME}
CHAIN_PEER_ENDPOINT=localhost:7051
CHAIN_PEER_HOST_OVERRIDE=peer0.org1.example.com
CHAIN_TLS_CERT_PATH=${tls_cert}
CHAIN_CERT_PATH=${admin_cert}
CHAIN_KEY_DIR=${admin_key_dir}
EOF
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    if [[ -f "${admin_cert}" ]]; then
        success "인증서 파일 확인: ${admin_cert}"
    else
        warn "인증서 파일이 아직 없습니다. 네트워크 시작 후 다시 --env 를 실행하세요."
    fi
}

# ── 상태 확인 ─────────────────────────────────────────────────────────────────
check_status() {
    info "체인코드 배포 상태 확인..."

    if ! docker ps --format '{{.Names}}' | grep -q "peer0.org1"; then
        warn "Fabric 네트워크가 실행 중이지 않습니다."
        return
    fi

    success "Fabric 컨테이너 실행 중:"
    docker ps --format '  {{.Names}}\t{{.Status}}' | grep -E "peer|orderer|couchdb" || true

    export FABRIC_CFG_PATH="${FABRIC_NETWORK}/../config"
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID=Org1MSP
    export CORE_PEER_TLS_ROOTCERT_FILE="${FABRIC_NETWORK}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${FABRIC_NETWORK}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
    export CORE_PEER_ADDRESS=localhost:7051

    echo ""
    info "커밋된 체인코드:"
    peer lifecycle chaincode querycommitted --channelID "${CHANNEL_NAME}" 2>/dev/null || \
        warn "채널 ${CHANNEL_NAME} 에서 체인코드 조회 실패"
}

# ── 네트워크 종료 ─────────────────────────────────────────────────────────────
teardown() {
    info "Fabric 네트워크 종료 중..."
    cd "${FABRIC_NETWORK}"
    ./network.sh down
    rm -rf "${CC_DEMO_TMP}"
    success "네트워크 종료 완료"
}

# ── Go 단위 테스트 실행 ───────────────────────────────────────────────────────
run_tests() {
    info "체인코드 단위 테스트 실행 중..."
    (cd "${CC_SRC}" && go test ./... -v 2>&1 | tail -20)
    success "모든 단위 테스트 통과"
}

# ── 메인 ──────────────────────────────────────────────────────────────────────
main() {
    case "${1:-deploy}" in
        --help|-h)
            usage
            exit 0
            ;;
        --down)
            ensure_fabric_samples
            teardown
            ;;
        --status)
            ensure_fabric_samples
            check_status
            ;;
        --env)
            print_env
            ;;
        --test)
            run_tests
            ;;
        deploy|"")
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo " PetChain 체인코드 자동 배포"
            echo " 채널: ${CHANNEL_NAME}  |  체인코드: ${CC_NAME}  |  버전: ${CC_VERSION}"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            check_prereqs
            run_tests
            ensure_fabric_samples
            setup_path
            prepare_demo_chaincode
            start_network
            deploy_chaincode
            verify_deployment
            print_env
            echo ""
            success "배포 완료! 위 환경변수를 .env 에 추가하고 백엔드를 재시작하세요."
            echo ""
            ;;
        *)
            error "알 수 없는 옵션: $1"
            usage
            exit 1
            ;;
    esac
}

main "${@}"
