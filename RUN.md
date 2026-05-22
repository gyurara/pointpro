# PetChain 실행 가이드 (프론트 / 백엔드 / 체인코드)

> **터미널 직접 실행 (Docker 없이)** 방법은 아래 [로컬 직접 실행](#로컬-직접-실행-docker-없이) 섹션 참조.

로컬에서 **프론트엔드 → 백엔드 → Hyperledger Fabric 체인코드 → 원장/DB** 전 구간을 띄우는 방법.
2026-05-22 실제 검증한 절차 기준.

---

## 로컬 직접 실행 (Docker 없이)

### 환경
- MySQL 8.0 로컬 설치 — root / **1234**
- Java 21, Node.js 20 (nvm)
- `.env` 의 `DB_PASSWORD=1234` 로 설정되어 있음

### 전체 순서

```bash
# 1. MySQL 시작
sudo systemctl start mysql

# 2. Fabric 네트워크 + 체인코드 (이미 떠 있으면 생략)
cd ~/fabric-samples/test-network
./network.sh down
docker volume rm compose_orderer.example.com compose_peer0.org1.example.com compose_peer0.org2.example.com 2>/dev/null || true
./network.sh up createChannel -ca -c petchannel
./network.sh deployCC -c petchannel -ccn petchain \
  -ccp /home/ubuntu/workspace/petchain/pointpro/chaincode/petchain -ccl go
# install 타임아웃 나면 deployCC 한 번 더 실행 (캐시로 즉시 통과)

# 3. Spring Boot 백엔드
cd ~/workspace/petchain/pointpro/be/backend
./gradlew bootRun
# → "Fabric Gateway 연결 완료" 로그 뜨면 정상. http://localhost:8080

# 4. 프론트엔드 개발 서버 (새 터미널)
cd ~/workspace/petchain/pointpro/fe/petchain
npm run dev
# → http://localhost:5173
```

> Fabric 없이 백엔드만 실행: `CHAIN_ENABLED=false ./gradlew bootRun`

### 시드 계정

| 역할 | ID | 비밀번호 |
|---|---|---|
| 관리자 | admin | admin1234 |
| 병원 | hospital-major-kamc | hospital1234 |
| 보험사 | insurance-samsung | insurance1234 |

---

## 구성 요약

| 구성요소 | 위치 / 이미지 | 포트 |
|---|---|---|
| 프론트엔드 | `fe/petchain` (nginx) | `:8088` (호스트) |
| 백엔드 | `be/backend` (Spring Boot, Java 17) | `:8080` |
| MySQL | `mysql:8.0` | 내부 3306 |
| Fabric test-network | `~/fabric-samples/test-network` (2.5) | peer `:7051`/`:9051`, orderer `:7050` |
| 체인코드 | `chaincode/petchain` (Go 1.16 모듈), 채널 `petchannel`, 이름 `petchain` | — |

- 프로젝트 루트: `/home/ubuntu/workspace/petchain/pointpro`
- 백엔드는 `chain.enabled=true` 일 때 Org1 `User1` 신원으로 peer 에 접속(`docker-compose.override.yml`).

## 사전 요구사항

- Docker / Docker Compose
- `~/fabric-samples` (Fabric 2.5 바이너리 + test-network)
- 프로젝트 루트에 `.env` 존재 (DB/JWT/admin 비밀번호 등). 없으면 `.env.example` 복사.

---

## 1. 체인코드 (Fabric 네트워크 + 배포)

### 1-1. (선택) 로컬 빌드/테스트
```bash
cd /home/ubuntu/workspace/petchain/pointpro/chaincode/petchain
go build ./... && go test ./...      # 14개 테스트 통과
go mod vendor                        # vendor 폴더 (오프라인 빌드용)
```

### 1-2. 네트워크 정리 후 기동
```bash
cd ~/fabric-samples/test-network
./network.sh down

# ⚠️ 이 체크아웃은 down 이 ledger 볼륨을 못 지운다(이름이 compose_* 인데 docker_* 로 삭제 시도).
#    지우지 않으면 up 시 "channel already exists" / "ledger already exists ACTIVE" 에러.
docker volume rm compose_orderer.example.com \
                 compose_peer0.org1.example.com \
                 compose_peer0.org2.example.com 2>/dev/null

./network.sh up createChannel -ca -c petchannel
```

### 1-3. 체인코드 배포
```bash
cd ~/fabric-samples/test-network
./network.sh deployCC \
  -c petchannel -ccn petchain \
  -ccp /home/ubuntu/workspace/petchain/pointpro/chaincode/petchain \
  -ccl go
```
> ⚠️ **install 단계에서 "timeout expired" 로 실패하면 그냥 위 명령을 다시 실행**한다.
> 첫 빌드(go 1.26 정적링크)가 ~5분 걸려 peer 의 300s installtimeout 을 넘기지만,
> 빌드는 백그라운드에서 완료되어 이미지가 캐시되므로 재실행하면 즉시 commit 까지 진행된다.
> (vendor 가 패키지에 포함돼 빌드는 오프라인으로 성공 — 네트워크 문제 아님.)

### 1-4. 배포 확인
```bash
cd ~/fabric-samples/test-network
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode querycommitted --channelID petchannel --name petchain
# → Version: 1.0, Sequence: 1, Approvals: [Org1MSP: true, Org2MSP: true]

# 직접 invoke 스모크 테스트
peer chaincode query -C petchannel -n petchain \
  -c '{"function":"GetPointBalance","Args":["P-186525382953"]}'
```

> 백엔드는 Org1MSP(=체인코드의 `platformMSP`) 신원으로 `petchannel` 에 쓴다.
> 권한 게이트가 `petchannel` 에서는 `requireOrg(platformMSP)` 로 떨어지므로 Org1MSP 로 모든 호출이 통과한다.

---

## 2. 백엔드 (온체인 연동 ON)

`docker compose up -d backend` 가 `docker-compose.override.yml`(gitignore)을 자동 머지한다.
override 가 `CHAIN_ENABLED=true`, Org1 `User1` 신원/인증서, `/fabric` 마운트, external `fabric_test` 네트워크 합류를 설정한다.

```bash
cd /home/ubuntu/workspace/petchain/pointpro
docker compose up -d backend

# 부팅 + Fabric Gateway 연결 확인 (약 85초)
docker logs -f petchain-backend | grep -m1 "Fabric Gateway 연결 완료"
# → Fabric Gateway 연결 완료 — peer=peer0.org1.example.com:7051 channel=petchannel chaincode=petchain
```

코드(`build.gradle` 등)를 바꿨으면 이미지 재빌드 후 기동:
```bash
docker compose build backend && docker compose up -d backend
```

> 오프체인 전용으로 띄우려면 override 없이 `docker compose -f docker-compose.yml up -d backend`
> (chain.enabled 기본 false → NoOp, Fabric 없이도 앱 정상).

---

## 3. 프론트엔드

```bash
cd /home/ubuntu/workspace/petchain/pointpro
docker compose up -d frontend
```
- 접속: http://localhost:8088 (포트는 `.env` 의 `APP_PORT`)
- nginx 가 `/api` 를 백엔드로 프록시한다.

확인:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8088/            # 200
curl -s -X POST http://localhost:8088/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"loginId":"admin","password":"<.env 의 ADMIN_PASSWORD>"}'           # accessToken 반환
```

---

## 4. 동작 확인 (E2E)

시드 계정 (비밀번호):
- 관리자: `admin` / `.env` 의 `ADMIN_PASSWORD`
- 병원: `hospital-major-kamc` / `hospital1234`
- 보험사: `insurance-samsung` / `insurance1234`

전체 흐름: **보호자 가입 → 펫 등록 → (병원)진료기록 → (보호자)동의 → (관리자)포인트발행 → (보험사)제출 → (보험사)검증**

| 단계 | 호출 | 체인코드 | 토큰 |
|---|---|---|---|
| 진료기록 | `POST /api/records` (multipart) | RegisterRecord | 병원 |
| 동의 | `POST /api/consents` | RegisterConsent | 보호자 |
| 포인트발행 | `POST /api/admin/insurers/{id}/points/issue` | IssuePoints | 관리자 |
| 제출 | `POST /api/submissions` | CreateSubmissionWithConsent | 보험사 |
| **검증** | `POST /api/submissions/{id}/verification` | ProcessSuccessfulVerification | 보험사 |

> ⚠️ 실제 검증(체인 호출)은 `POST /api/submissions/{id}/verification` 이다.
> `POST /api/internal/submissions/{id}/verify` 는 PENDING/BLOCKED 만 반환하는 **스텁**(체인 미호출).

DB 에 온체인 tx id 적재 확인:
```bash
docker exec petchain-mysql sh -c \
 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" petchain -t -e "
  SELECT record_id, on_chain_status, LEFT(fabric_tx_id,16) FROM medical_records ORDER BY id DESC LIMIT 1;
  SELECT id, claim_status, LEFT(fabric_tx_id,16), LEFT(verify_tx_id,16) FROM claim_packages ORDER BY id DESC LIMIT 1;
  SELECT id, LEFT(fabric_tx_id,16) FROM verification_logs ORDER BY id DESC LIMIT 1;
  SELECT id, tx_type, amount, LEFT(fabric_tx_id,16) FROM point_transactions ORDER BY id DESC LIMIT 1;"'
```

---

## 5. 종료

```bash
cd /home/ubuntu/workspace/petchain/pointpro
docker compose down                       # 프론트/백/DB

cd ~/fabric-samples/test-network
./network.sh down                         # Fabric
docker volume rm compose_orderer.example.com \
                 compose_peer0.org1.example.com \
                 compose_peer0.org2.example.com 2>/dev/null
```

---

## 6. 트러블슈팅 (실제 발생한 이슈)

| 증상 | 원인 | 해결 |
|---|---|---|
| `up` 시 `channel already exists` / `ledger already exists ACTIVE` | `network.sh down` 이 `compose_*` ledger 볼륨을 못 지움 | 위 `docker volume rm compose_*` 수동 삭제 |
| install `timeout expired while executing transaction` | 첫 빌드가 300s installtimeout 초과 | deployCC 재실행 (이미지 캐시되어 통과) |
| 백엔드 부팅 실패 — `ProtobufRuntimeVersionException` (gencode 4.28.2 / runtime 4.26.1) | fabric-gateway 가 끌어오는 protobuf-java 가 낮음 | `build.gradle` 에 `resolutionStrategy.force 'com.google.protobuf:protobuf-java:4.28.2'` (적용됨) |
| 백엔드 부팅 실패 — 인증서 파일 못 찾음 | `-ca` 플로우는 `signcerts/cert.pem` 생성하나 경로가 `User1@...-cert.pem` | `docker-compose.override.yml` 의 `CHAIN_CERT_PATH` 를 `.../signcerts/cert.pem` 로 (적용됨) |
| invoke 시 `MSP Org1MSP is not allowed` | 체인코드 권한 상수와 신원 MSP 불일치 | `main.go` 의 `platformMSP = "Org1MSP"` 매핑 확인(적용됨) |
