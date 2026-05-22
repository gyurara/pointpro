# PetChain 시연 대본

---

## 0. 랜딩 페이지 (http://localhost:8088)

- PetChain 소개 화면
- "시작하기" 버튼으로 로그인 이동

---

## 1. 보호자 — 회원가입 & 반려동물 등록

1. 로그인 페이지에서 **회원가입** 탭 선택
2. 이름 / 전화번호 / 이메일 / 비밀번호 / 주소 입력 후 가입
3. 보호자 대시보드 진입
4. **내 반려동물** 탭 → `+ 반려동물 추가`
   - 이름, 종류(강아지/고양이/토끼), 품종, 출생연도 입력
   - PetChain ID 자동 발급 (`A-숫자`)
   - 마이크로칩 번호 입력 시 SHA-256 해시 후 온체인 기록

---

## 2. 병원 — 진료기록 등록

1. `hospital-major-kamc / hospital1234` 로 로그인
2. **진료기록 등록** 탭
3. PetChain ID 입력 → 환자 조회
4. 질병 코드 / 진료 행위 코드 / 진료비 / 진료 소견 입력
5. 영수증·X-RAY 파일 첨부 (S3 오프체인 / 해시값만 온체인)
6. `🔗 원장에 기록 (on-chain)` 클릭
   - SHA-256 해시 생성
   - Hyperledger Fabric 원장에 `RegisterRecord` 트랜잭션 기록
   - DB `medical_records.fabric_tx_id` / `on_chain_status = confirmed`

---

## 3. 보호자 — 동의 관리

1. 보호자 계정으로 재로그인
2. **동의 관리** 탭
3. 등록된 진료기록 카드의 토글 **ON**
   - 보험사에 서류 자동 전달 시작
   - 체인코드 `RegisterConsent` 호출 → 동의 상태 온체인 기록
4. 토글 **OFF** 시 → `RevokeConsent` 호출, 보험사 접근 즉시 차단

---

## 4. 관리자 — 포인트 발행

1. `admin` 계정으로 로그인 → 플랫폼 관리자 대시보드
2. **Org 관리** 탭 — 병원·보험사 승인 대기 목록 확인 및 승인
3. 보험사 포인트 발행 (API: `POST /api/admin/insurers/{id}/points/issue`)
   - 체인코드 `IssuePoints` 호출
   - DB `point_transactions.fabric_tx_id` 적재

---

## 5. 보험사 — 검증 API 호출

1. `insurance-samsung / insurance1234` 로 로그인
2. **검증 대기 목록** 탭
   - 동의 ACTIVE 건만 표시
   - 동의 철회 건은 `BLOCKED_BY_CONSENT` 로 접근 차단
3. 대상 건 `검증 API →` 클릭
   - 제출 생성 (`CreateSubmissionWithConsent`)
   - 해시 검증 + 동의 확인 + 중복 체크 (`ProcessSuccessfulVerification`)
   - 포인트 1pt 차감
   - DB `claim_packages.verify_tx_id` / `verification_logs.fabric_tx_id` 적재
4. **검증 결과** 탭 → `PASSED` 확인
   - 해시 일치 / 중복 없음 / 동의 ACTIVE / on-chain confirmed
5. 내부 심사 후 **승인 / 반려 / 이상 신고** 선택

---

## 6. 보험사 — 이상 신고

1. 검증 결과 카드에서 `⚠️ 이상 신고` 클릭
2. 신고 사유 선택 (중복 청구 의심 / 진료비 불일치 / 서류 위조 의심 등)
3. 상세 내용 입력 후 `플랫폼에 이상 신고 전달`
4. DB `record_flags` 저장 → 관리자 대시보드에 실시간 반영

---

## 7. 관리자 — 이상 신고 처리

1. 플랫폼 관리자 대시보드 **이상 신고** 탭 (뱃지 표시)
2. 검토 대기 목록 확인 → `처리하기`
3. 처리 결과 선택 (사기 확인 / 오탐 / 추가 자료 요청 / 외부 기관 이관)
4. 처리 완료 후 이력 기록

---

## 8. 보호자 — 커뮤니티 & 지역 랭킹

1. 보호자 대시보드 **커뮤니티** 탭
2. 거주지역 설정 → 같은 지역 게시물에만 투표(좋아요) 가능
3. 반려동물 사진 첨부(JPEG 압축 자동)·게시물 작성
4. 댓글 / 대댓글 작성
5. **지역 랭킹** 탭 → 한국 지도 SVG
   - 지역 핀 클릭 → 해당 지역 좋아요 TOP 10 조회

---

## 9. DB & 체인코드 교차 확인 (선택 — 기술 심사용)

```bash
# DB 온체인 TX ID 확인
docker exec petchain-mysql sh -c \
 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" petchain -t -e "
  SELECT record_id, on_chain_status, LEFT(fabric_tx_id,20) FROM medical_records ORDER BY id DESC LIMIT 1;
  SELECT id, claim_status, LEFT(fabric_tx_id,20), LEFT(verify_tx_id,20) FROM claim_packages ORDER BY id DESC LIMIT 1;
  SELECT id, LEFT(fabric_tx_id,20) FROM verification_logs ORDER BY id DESC LIMIT 1;
  SELECT id, tx_type, amount, LEFT(fabric_tx_id,20) FROM point_transactions ORDER BY id DESC LIMIT 2;"'

# 체인코드 레저 직접 조회
cd ~/fabric-samples/test-network
export PATH=$PWD/../bin:$PATH FABRIC_CFG_PATH=$PWD/../config/ \
  CORE_PEER_TLS_ENABLED=true CORE_PEER_LOCALMSPID=Org1MSP \
  CORE_PEER_TLS_ROOTCERT_FILE=$PWD/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  CORE_PEER_MSPCONFIGPATH=$PWD/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp \
  CORE_PEER_ADDRESS=localhost:7051

peer chaincode query -C petchannel -n petchain -c '{"function":"GetConsentStatus","Args":["CON-{claimId}"]}'
peer chaincode query -C petchannel -n petchain -c '{"function":"GetVerificationResult","Args":["VER-{verificationLogId}"]}'
peer chaincode query -C petchannel -n petchain -c '{"function":"GetPointBalance","Args":["P-{insurerMemberNumber}"]}'
```
