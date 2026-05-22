package com.blockchain.backend.petchainAPI.service;

import com.blockchain.backend.chain.PetChainLedger;
import com.blockchain.backend.common.HashContract;
import com.blockchain.backend.petchainAPI.dto.common.ConsentStatus;
import com.blockchain.backend.petchainAPI.dto.consent.ConsentDtos;
import com.blockchain.backend.petchainAPI.error.ApiErrorCode;
import com.blockchain.backend.petchainAPI.error.ApiException;
import com.blockchain.backend.petchainAPI.port.ConsentApiPort;
import com.blockchain.backend.petchainAPI.security.ApiActor;
import com.blockchain.backend.petchainDB.entity.ClaimPackage;
import com.blockchain.backend.petchainDB.entity.Guardian;
import com.blockchain.backend.petchainDB.entity.InsuranceCompany;
import com.blockchain.backend.petchainDB.entity.MedicalRecord;
import com.blockchain.backend.petchainDB.entity.PetInsurance;
import com.blockchain.backend.petchainDB.repository.ClaimPackageRepository;
import com.blockchain.backend.petchainDB.repository.MedicalRecordRepository;
import com.blockchain.backend.petchainDB.repository.PetInsuranceRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ConsentService implements ConsentApiPort {
    private static final Logger log = LoggerFactory.getLogger(ConsentService.class);

    private final ApiDomainSupport support;
    private final ClaimPackageRepository claimPackageRepository;
    private final MedicalRecordRepository medicalRecordRepository;
    private final PetInsuranceRepository petInsuranceRepository;
    private final PetChainLedger chainLedger;

    @Override
    @Transactional
    public ConsentDtos.ConsentResponse createConsent(ApiActor actor, ConsentDtos.CreateConsentRequest request) {
        MedicalRecord record = support.recordByRecordId(request.recordId());
        // 보호자는 요청 body가 아니라 인증된 액터에서 도출한다(클라이언트가 보낸 식별자를 신뢰하지 않음).
        Long actorUserId = support.parseActorUserId(actor);
        Guardian guardian = (actorUserId != null)
                ? support.guardianByActor(actor)
                : support.guardianByExternalId(request.guardianId());
        InsuranceCompany insurer = support.insurerByExternalId(request.insurerId());
        support.requireGuardianScope(actor, guardian);
        if (!Objects.equals(record.getPet().getGuardian().getId(), guardian.getId())) {
            throw new ApiException(ApiErrorCode.FORBIDDEN_ORG_SCOPE, "진료기록의 보호자가 일치하지 않습니다.");
        }

        ClaimPackage claim = claimPackageRepository
                .findByMedicalRecord_RecordIdAndInsuranceCompany_Id(record.getRecordId(), insurer.getId())
                .orElseGet(() -> newClaim(record, guardian, insurer));
        claim.setConsentStatus("active");
        claim.setConsentedAt(java.time.LocalDateTime.now());
        claim.setClaimStatus("requested");
        ClaimPackage saved = claimPackageRepository.save(claim);

        // ── 체인코드 연동: 보호자 동의 등록 ─────────────────────────────────
        if (chainLedger.isEnabled()) {
            try {
                String guardianHashedId = HashContract.hashBytes(
                        guardian.getMemberNumber().getBytes(StandardCharsets.UTF_8));
                Instant consentedAt = saved.getConsentedAt().toInstant(ZoneOffset.UTC);
                String validUntil = consentedAt.plusSeconds(365L * 24 * 60 * 60).toString();
                String txId = chainLedger.registerConsent(
                        "CON-" + saved.getClaimId(),
                        record.getRecordId(),
                        insurer.getMemberNumber(),
                        guardianHashedId,
                        validUntil,
                        consentedAt.toString());
                saved.setFabricTxId(txId.isEmpty() ? null : txId);
            } catch (Exception e) {
                log.warn("RegisterConsent 온체인 반영 실패 (claimId={}): {}", saved.getClaimId(), e.getMessage());
            }
        }

        return toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public ConsentDtos.ConsentListResponse listConsents(ApiActor actor, String recordId, String guardianId, String insurerId, String hospitalId) {
        // "me" 를 역할별 실제 ID로 치환한다. 역할 불일치 시 null 유지.
        String gId = resolveId(guardianId, () -> String.valueOf(support.guardianByActor(actor).getId()));
        String iId = resolveId(insurerId,  () -> String.valueOf(support.insurerByActor(actor).getId()));
        String hId = resolveId(hospitalId, () -> String.valueOf(support.hospitalByActor(actor).getId()));

        List<ClaimPackage> claims = claimPackageRepository.findAll().stream()
                .filter(c -> recordId == null || Objects.equals(c.getMedicalRecord().getRecordId(), recordId))
                .filter(c -> gId == null || Objects.equals(String.valueOf(c.getGuardian().getId()), gId) || Objects.equals(c.getGuardian().getMemberNumber(), gId))
                .filter(c -> iId == null || Objects.equals(String.valueOf(c.getInsuranceCompany().getId()), iId) || Objects.equals(c.getInsuranceCompany().getMemberNumber(), iId))
                .filter(c -> hId == null || Objects.equals(String.valueOf(c.getMedicalRecord().getHospital().getId()), hId) || Objects.equals(c.getMedicalRecord().getHospital().getMemberNumber(), hId))
                .toList();

        List<ConsentDtos.ConsentResponse> responses = new ArrayList<>(claims.stream().map(this::toResponse).toList());

        // 보호자 조회 시: ClaimPackage 없는 진료기록도 PENDING 상태로 포함해 동의 탭에 표시한다.
        if (gId != null && iId == null) {
            Set<String> covered = claims.stream()
                    .map(c -> c.getMedicalRecord().getRecordId())
                    .collect(Collectors.toSet());
            medicalRecordRepository.findAll().stream()
                    .filter(r -> Objects.equals(String.valueOf(r.getPet().getGuardian().getId()), gId))
                    .filter(r -> !covered.contains(r.getRecordId()))
                    .filter(r -> recordId == null || Objects.equals(r.getRecordId(), recordId))
                    .forEach(r -> responses.add(toPendingResponse(r, gId)));
        }

        return new ConsentDtos.ConsentListResponse(responses);
    }

    private String resolveId(String param, java.util.function.Supplier<String> resolver) {
        if (!"me".equalsIgnoreCase(param)) return param;
        try { return resolver.get(); } catch (Exception e) { return null; }
    }

    private ConsentDtos.ConsentResponse toPendingResponse(MedicalRecord record, String guardianId) {
        List<String> diagnoses = support.diagnosisCodes(record);
        return new ConsentDtos.ConsentResponse(
                null,
                record.getRecordId(),
                null,
                guardianId,
                ConsentStatus.PENDING,
                null,
                null,
                null,
                null,
                record.getPet().getName(),
                record.getHospital().getName(),
                null,
                diagnoses.isEmpty() ? null : diagnoses.get(0),
                java.math.BigDecimal.valueOf(record.getTotalCost()),
                record.getTreatmentDate(),
                String.valueOf(record.getPet().getId()),
                String.valueOf(record.getHospital().getId()),
                record.getDetailDataHash(),
                "pending",
                null
        );
    }

    @Override
    @Transactional(readOnly = true)
    public ConsentDtos.ConsentResponse getConsent(ApiActor actor, String consentId) {
        return toResponse(support.claimBySubmissionId(consentId));
    }

    @Override
    @Transactional
    public ConsentDtos.ConsentResponse revokeConsent(ApiActor actor, String consentId, ConsentDtos.RevokeConsentRequest request) {
        ClaimPackage claim = support.claimBySubmissionId(consentId);
        support.requireGuardianScope(actor, claim.getGuardian());
        claim.setConsentStatus("revoked");
        claim.setClaimStatus("pending");

        // ── 체인코드 연동: 동의 철회 ─────────────────────────────────────────
        if (chainLedger.isEnabled()) {
            try {
                String reason = (request != null && request.reason() != null && !request.reason().isBlank())
                        ? request.reason() : "USER_REVOKED";
                chainLedger.revokeConsent("CON-" + claim.getClaimId(), Instant.now().toString(), reason);
            } catch (Exception e) {
                log.warn("RevokeConsent 온체인 반영 실패 (claimId={}): {}", claim.getClaimId(), e.getMessage());
            }
        }

        return toResponse(claim);
    }

    private ClaimPackage newClaim(MedicalRecord record, Guardian guardian, InsuranceCompany insurer) {
        PetInsurance petInsurance = petInsuranceRepository
                .findFirstByPet_IdAndInsuranceCompany_Id(record.getPet().getId(), insurer.getId())
                .orElseGet(() -> createPolicy(record, guardian, insurer));
        ClaimPackage claim = new ClaimPackage();
        claim.setMedicalRecord(record);
        claim.setGuardian(guardian);
        claim.setInsuranceCompany(insurer);
        claim.setPetInsurance(petInsurance);
        claim.setConsentStatus("active");
        claim.setClaimStatus("requested");
        return claim;
    }

    private PetInsurance createPolicy(MedicalRecord record, Guardian guardian, InsuranceCompany insurer) {
        PetInsurance policy = new PetInsurance();
        policy.setPet(record.getPet());
        policy.setGuardian(guardian);
        policy.setInsuranceCompany(insurer);
        policy.setProductName("PetChain 기본 연동 보험");
        policy.setPolicyNumber("POL-" + record.getPet().getId() + "-" + insurer.getId());
        policy.setStartDate(LocalDate.now());
        policy.setStatus("active");
        return petInsuranceRepository.save(policy);
    }

    private ConsentDtos.ConsentResponse toResponse(ClaimPackage claim) {
        var snapshot = support.consentSnapshot(claim);
        MedicalRecord record = claim.getMedicalRecord();
        List<String> diagnoses = support.diagnosisCodes(record);
        return new ConsentDtos.ConsentResponse(
                claim.getClaimId(),
                record.getRecordId(),
                String.valueOf(claim.getInsuranceCompany().getId()),
                String.valueOf(claim.getGuardian().getId()),
                snapshot.status(),
                snapshot.consentedAt(),
                snapshot.expiresAt(),
                claim.getFabricTxId(),
                claim.getClaimId(),
                record.getPet().getName(),
                record.getHospital().getName(),
                claim.getInsuranceCompany().getName(),
                diagnoses.isEmpty() ? null : diagnoses.get(0),
                java.math.BigDecimal.valueOf(record.getTotalCost()),
                record.getTreatmentDate(),
                String.valueOf(record.getPet().getId()),
                String.valueOf(record.getHospital().getId()),
                record.getDetailDataHash(),
                claim.getClaimStatus(),
                claim.getReviewResult()
        );
    }
}
