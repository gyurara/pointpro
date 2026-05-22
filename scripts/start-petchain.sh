#!/bin/bash
# PetChain 전체 스택 자동 시작 스크립트
# 1. Fabric 네트워크 기동 + 체인코드 배포
# 2. Spring Boot 체인 인증서 환경변수 설정
# 3. Spring Boot 백엔드 실행

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

# .env 값을 선택적으로 읽는다. 이미 셸 환경변수로 넘긴 값이 있으면 그 값을 우선한다.
read_env() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- \
    | sed -e 's/[[:space:]]*#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
          -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

env_or_file() {
  local key="$1"
  local default_value="$2"
  local current_value="${!key:-}"
  local file_value=""

  if [[ -n "$current_value" ]]; then
    printf '%s' "$current_value"
    return
  fi

  file_value="$(read_env "$key")"
  if [[ -n "$file_value" ]]; then
    printf '%s' "$file_value"
  else
    printf '%s' "$default_value"
  fi
}

resolve_path() {
  local raw_path="$1"

  if [[ "$raw_path" == '~' ]]; then
    raw_path="$HOME"
  elif [[ "$raw_path" == '~/'* ]]; then
    raw_path="$HOME/${raw_path#~/}"
  elif [[ "$raw_path" == '$HOME'* ]]; then
    raw_path="$HOME${raw_path#\$HOME}"
  fi

  if [[ "$raw_path" != /* ]]; then
    raw_path="$REPO_ROOT/$raw_path"
  fi

  printf '%s' "$raw_path"
}

NETWORK_DIR="$(resolve_path "$(env_or_file FABRIC_NETWORK_DIR "$HOME/go/src/fabric-samples/test-network")")"
CHAINCODE_DIR="$(resolve_path "$(env_or_file CHAINCODE_DIR "$REPO_ROOT/chaincode/petchain")")"
BACKEND_DIR="$(resolve_path "$(env_or_file BACKEND_DIR "$REPO_ROOT/be/backend")")"
FRONTEND_DIR="$(resolve_path "$(env_or_file FRONTEND_DIR "$REPO_ROOT/fe/petchain")")"
CHANNEL="$(env_or_file CHAIN_CHANNEL "petchannel")"
CC_NAME="$(env_or_file CHAIN_CHAINCODE "petchain")"
CHAIN_MSP_ID="$(env_or_file CHAIN_MSP_ID "Org1MSP")"
CHAIN_PEER_ENDPOINT="$(env_or_file CHAIN_PEER_ENDPOINT "localhost:7051")"
CHAIN_PEER_HOST_OVERRIDE="$(env_or_file CHAIN_PEER_HOST_OVERRIDE "peer0.org1.example.com")"

# 이 스크립트는 백엔드를 Docker Compose 네트워크가 아닌 호스트에서 bootRun 으로 실행한다.
# 따라서 배포용 .env 의 DB_HOST=mysql 대신 로컬 접속 주소를 별도로 사용한다.
LOCAL_DB_HOST="$(env_or_file LOCAL_DB_HOST "127.0.0.1")"
LOCAL_DB_PORT="$(env_or_file LOCAL_DB_PORT "3306")"
LOCAL_DB_NAME="$(env_or_file LOCAL_DB_NAME "petchain")"
LOCAL_DB_USERNAME="$(env_or_file LOCAL_DB_USERNAME "root")"
LOCAL_DB_PASSWORD="$(env_or_file LOCAL_DB_PASSWORD "1234")"
LOCAL_FRONTEND_URL="$(env_or_file LOCAL_FRONTEND_URL "http://localhost:5173")"
LOCAL_CORS_ALLOWED_ORIGINS="$(env_or_file LOCAL_CORS_ALLOWED_ORIGINS "${LOCAL_FRONTEND_URL},http://127.0.0.1:5173")"

mysql_host_status() {
  mysqladmin -h "$LOCAL_DB_HOST" -P "$LOCAL_DB_PORT" -u "$LOCAL_DB_USERNAME" -p"$LOCAL_DB_PASSWORD" status >/dev/null 2>&1
}

mysql_container_status() {
  docker exec petchain-mysql mysqladmin -u "$LOCAL_DB_USERNAME" -p"$LOCAL_DB_PASSWORD" status >/dev/null 2>&1
}

echo "=============================="
echo " PetChain 스택 시작"
echo "=============================="

# ── 1. Fabric 네트워크 기동 ──────────────────────────────────────
echo ""
echo "[1/4] Fabric 네트워크 시작 중..."
cd "$NETWORK_DIR"

# 이미 실행 중인 컨테이너 + CA 컨테이너 완전 정리
./network.sh down 2>/dev/null || true
docker rm -f orderer.example.com peer0.org1.example.com peer0.org2.example.com cli couchdb0 \
  ca_org1 ca_org2 ca_orderer 2>/dev/null || true
# 볼륨도 강제 삭제 (network.sh down이 compose_ 접두사 볼륨을 못 지우는 문제 보완)
docker volume rm -f \
  compose_orderer.example.com compose_peer0.org1.example.com compose_peer0.org2.example.com \
  docker_orderer.example.com docker_peer0.org1.example.com docker_peer0.org2.example.com \
  2>/dev/null || true

# 이전 실행의 stale 인증서/채널 데이터 제거 (재등록 충돌 방지)
# organizations/ 전체가 아닌 생성된 하위 디렉토리만 삭제 (static 스크립트 보존)
# Docker 컨테이너가 root로 생성했을 수 있으므로 Docker로 권한 문제 없이 삭제
docker run --rm \
  -v "$NETWORK_DIR/organizations:/target" \
  alpine sh -c "rm -rf /target/peerOrganizations /target/ordererOrganizations" 2>/dev/null || true
docker run --rm \
  -v "$NETWORK_DIR:/target" \
  alpine sh -c "rm -rf /target/channel-artifacts /target/system-genesis-block" 2>/dev/null || true
# git static 파일 복구 (registerEnroll.sh 등 스크립트가 삭제됐을 경우 대비)
git -C "$NETWORK_DIR/.." restore test-network/organizations/ 2>/dev/null || true

./network.sh up createChannel -ca -c "$CHANNEL"
echo "✅ 네트워크 + 채널 생성 완료"

# ── 2. 체인코드 배포 ─────────────────────────────────────────────
echo ""
echo "[2/4] 체인코드 배포 중..."
./network.sh deployCC \
  -c "$CHANNEL" \
  -ccn "$CC_NAME" \
  -ccp "$CHAINCODE_DIR" \
  -ccl go
echo "✅ 체인코드 배포 완료"

# ── 3. 인증서 경로 추출 → Spring Boot 환경변수 설정 ───────────
echo ""
echo "[3/4] 인증서 경로 설정 중..."

ORG1_DIR="$NETWORK_DIR/organizations/peerOrganizations/org1.example.com"

TLS_CERT="$NETWORK_DIR/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
CERT_PATH=$(find "$ORG1_DIR/users/User1@org1.example.com/msp/signcerts" -name "*.pem" | head -1)
KEY_DIR="$ORG1_DIR/users/User1@org1.example.com/msp/keystore/"

if [ ! -f "$TLS_CERT" ]; then
  echo "❌ TLS 인증서를 찾을 수 없습니다: $TLS_CERT"
  exit 1
fi

# Spring Boot 는 application.properties 의 ${ENV_VAR:default} placeholder 를 사용한다.
# 레포 파일을 팀원별 절대경로로 덮어쓰지 않고 현재 프로세스 환경변수로만 전달한다.
export CHAIN_ENABLED="$(env_or_file CHAIN_ENABLED "true")"
export CHAIN_MSP_ID
export CHAIN_CHANNEL="$CHANNEL"
export CHAIN_CHAINCODE="$CC_NAME"
export CHAIN_PEER_ENDPOINT
export CHAIN_PEER_HOST_OVERRIDE
export CHAIN_TLS_CERT_PATH="$TLS_CERT"
export CHAIN_CERT_PATH="$CERT_PATH"
export CHAIN_KEY_DIR="$KEY_DIR"

echo "✅ 체인 연결 환경변수 설정 완료"
echo "   TLS cert : $TLS_CERT"
echo "   cert     : $CERT_PATH"
echo "   keydir   : $KEY_DIR"

# ── 4. 백엔드 빌드 + 실행 ────────────────────────────────────────
echo ""
echo "[4/4] Spring Boot 백엔드 빌드 + 시작..."
# 이전 실행에서 남은 백엔드/프론트 프로세스 정리 (재시작 시 포트 충돌 방지)
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 5173/tcp 5174/tcp 2>/dev/null || true
cd "$BACKEND_DIR"

# MySQL 확인 (로컬 또는 Docker)
if ! mysql_host_status; then
  echo "⚠️  로컬 MySQL 접속이 아직 안 됩니다. petchain-mysql 컨테이너를 확인합니다..."
  docker start petchain-mysql 2>/dev/null || \
    docker run -d --name petchain-mysql \
      -e MYSQL_ROOT_PASSWORD="$LOCAL_DB_PASSWORD" \
      -e MYSQL_DATABASE="$LOCAL_DB_NAME" \
      -p "$LOCAL_DB_PORT:3306" mysql:8.0 \
      --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

  echo "MySQL 준비 대기..."
  for _ in {1..60}; do
    if mysql_host_status; then
      break
    fi
    sleep 2
  done

  if ! mysql_host_status; then
    echo "❌ MySQL 접속 실패: ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}, user=${LOCAL_DB_USERNAME}, db=${LOCAL_DB_NAME}" >&2

    if mysql_container_status; then
      echo "   컨테이너 내부에서는 접속됩니다. 호스트 포트 바인딩 또는 LOCAL_DB_HOST/LOCAL_DB_PORT 문제입니다." >&2
      echo "   확인: docker port petchain-mysql 3306/tcp" >&2
    else
      echo "   컨테이너 내부에서도 이 계정/비밀번호로 접속되지 않습니다." >&2
      echo "   기존 petchain-mysql 컨테이너가 다른 LOCAL_DB_PASSWORD 로 초기화됐을 수 있습니다." >&2
      echo "   확인: docker exec petchain-mysql mysqladmin -u${LOCAL_DB_USERNAME} -p'<비밀번호>' ping" >&2
    fi

    echo "   컨테이너 상태:" >&2
    docker ps -a --filter name=petchain-mysql --format '   {{.Names}} {{.Status}} {{.Ports}}' >&2 || true
    exit 1
  fi
fi

# bootRun 은 호스트에서 실행되므로 compose 서비스명(mysql)이 아니라 로컬 접속값을 우선 전달한다.
export PETCHAIN_ENV_FILE="$ENV_FILE"
export DB_HOST="$LOCAL_DB_HOST"
export DB_PORT="$LOCAL_DB_PORT"
export DB_NAME="$LOCAL_DB_NAME"
export DB_USERNAME="$LOCAL_DB_USERNAME"
export DB_PASSWORD="$LOCAL_DB_PASSWORD"
export FRONTEND_URL="$LOCAL_FRONTEND_URL"
export CORS_ALLOWED_ORIGINS="$LOCAL_CORS_ALLOWED_ORIGINS"

echo ""
echo "=============================="
echo " 모든 준비 완료! 백엔드 실행"
echo " http://localhost:8080"
echo "=============================="
# bootRun 은 서버 프로세스라 정상 실행 중에는 종료되지 않는다.
# --console=plain: Gradle 의 "80% EXECUTING" 진행 UI가 멈춘 것처럼 보이지 않게 한다.
# --no-daemon: Ctrl+C 시 이 스크립트가 백엔드 프로세스를 확실히 정리할 수 있게 한다.
./gradlew --no-daemon --console=plain bootRun &
BACKEND_PID=$!

# ── 5. 프론트엔드 개발 서버 기동 ─────────────────────────────────
echo ""
echo "[5/5] 프론트엔드 개발 서버 시작..."
# nvm 로드 후 Node 20 사용 (Vite는 Node 14.18+ 필요)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
nvm use 20 2>/dev/null || nvm use --lts 2>/dev/null || true
cd "$FRONTEND_DIR"
if [ ! -d node_modules ]; then
  echo "node_modules 없음, npm install 실행..."
  npm install
fi
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=============================="
echo " ✅ PetChain 전체 스택 실행 중"
echo " 백엔드  : http://localhost:8080"
echo " 프론트  : http://localhost:5173"
echo "=============================="
echo " 종료하려면 Ctrl+C 를 누르세요"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '✅ 종료 완료'" SIGINT SIGTERM
wait
