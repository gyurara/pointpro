package com.blockchain.backend.petchainAPI.dto.consent;

import com.blockchain.backend.petchainAPI.dto.common.ConsentStatus;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public final class ConsentDtos {
    private ConsentDtos() {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record CreateConsentRequest(
            @NotBlank String recordId,
            @NotBlank String insurerId,
            @NotBlank String guardianId
    ) {
    }

    // 동의 카드/목록이 그대로 렌더링할 수 있도록 펫·병원·보험사 이름과 진료 정보를 함께 내려준다.
    // recordHash 는 보험사 검증 호출(verifySubmission)이 실제 해시를 보낼 수 있도록 함께 노출한다.
    // PENDING 상태(동의 미생성)일 때는 consentId, insurerId 가 null 일 수 있다.
    public record ConsentResponse(
            String consentId,
            @NotBlank String recordId,
            String insurerId,
            @NotBlank String guardianId,
            @NotNull ConsentStatus status,
            Instant validFrom,
            Instant expiresAt,
            String blockchainReference,
            String auditLogId,
            String petName,
            String hospitalName,
            String insurerName,
            String disease,
            java.math.BigDecimal cost,
            java.time.LocalDate date,
            String petId,
            String hospitalId,
            String recordHash,
            String claimStatus,
            String reviewResult
    ) {
    }

    public record ConsentListResponse(
            List<@Valid ConsentResponse> consents
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record RevokeConsentRequest(
            String reason
    ) {
    }
}
