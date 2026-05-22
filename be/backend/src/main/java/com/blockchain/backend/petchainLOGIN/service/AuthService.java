package com.blockchain.backend.petchainLOGIN.service;

import com.blockchain.backend.common.DomainValues.AccountStatus;
import com.blockchain.backend.common.DomainValues.MemberType;
import com.blockchain.backend.common.DomainValues.PointOwnerType;
import com.blockchain.backend.common.IdentifierGenerator;
import com.blockchain.backend.petchainDB.entity.Guardian;
import com.blockchain.backend.petchainDB.entity.Hospital;
import com.blockchain.backend.petchainDB.entity.InsuranceCompany;
import com.blockchain.backend.petchainDB.entity.PointBalance;
import com.blockchain.backend.petchainDB.entity.RefreshToken;
import com.blockchain.backend.petchainDB.entity.User;
import com.blockchain.backend.petchainDB.repository.GuardianRepository;
import com.blockchain.backend.petchainDB.repository.HospitalRepository;
import com.blockchain.backend.petchainDB.repository.InsuranceCompanyRepository;
import com.blockchain.backend.petchainDB.repository.PointBalanceRepository;
import com.blockchain.backend.petchainDB.repository.RefreshTokenRepository;
import com.blockchain.backend.petchainDB.repository.UserRepository;
import com.blockchain.backend.petchainLOGIN.dto.request.HospitalRegisterRequest;
import com.blockchain.backend.petchainLOGIN.dto.request.InsuranceRegisterRequest;
import com.blockchain.backend.petchainLOGIN.dto.request.LoginRequest;
import com.blockchain.backend.petchainLOGIN.dto.request.UserRegisterRequest;
import com.blockchain.backend.petchainLOGIN.dto.response.AuthResponse;
import com.blockchain.backend.petchainLOGIN.util.JwtUtil;
import java.time.LocalDateTime;
import java.util.function.Predicate;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {
    private static final String DUPLICATE_ORG_ID = "이미 등록된 Org ID입니다.";
    private static final String DUPLICATE_FABRIC_ORG_ID = "이미 등록된 Fabric Org ID입니다.";
    private static final String DUPLICATE_BUSINESS_NUMBER = "이미 등록된 사업자등록번호입니다.";
    private static final String PENDING_APPROVAL_MESSAGE = "등록 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.";
    private static final String MEMBER_NUMBER_FAILURE = "회원번호 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.";

    private final UserRepository userRepository;
    private final GuardianRepository guardianRepository;
    private final HospitalRepository hospitalRepository;
    private final InsuranceCompanyRepository insuranceCompanyRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PointBalanceRepository pointBalanceRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    // 보호자(user) 회원가입
    @Transactional
    public AuthResponse registerUser(UserRegisterRequest req) {
        requireUnusedLoginId(req.getEmail(), "이미 사용 중인 이메일입니다.");

        String memberNumber = uniqueUserNumber();
        User user = createUser(req.getEmail(), req.getPassword(), MemberType.USER, AccountStatus.ACTIVE);

        Guardian guardian = new Guardian();
        guardian.setUser(user);
        guardian.setMemberNumber(memberNumber);
        guardian.setName(req.getName());
        guardian.setPhone(req.getPhone());
        guardian.setEmail(req.getEmail());
        guardian.setAddress(req.getAddress());
        guardianRepository.save(guardian);

        return issueTokens(user, memberNumber, "회원가입이 완료되었습니다.");
    }

    // 병원 등록 신청 (관리자 승인 대기)
    @Transactional
    public AuthResponse registerHospital(HospitalRegisterRequest req) {
        requireUnusedLoginId(req.getFabricOrgId(), DUPLICATE_ORG_ID);
        requireFalse(hospitalRepository.existsByFabricOrgId(req.getFabricOrgId()), DUPLICATE_FABRIC_ORG_ID);
        requireFalse(hospitalRepository.existsByBusinessNumber(req.getBusinessNumber()), DUPLICATE_BUSINESS_NUMBER);

        String memberNumber = uniqueHospitalNumber();
        User user = createUser(req.getFabricOrgId(), req.getPassword(), MemberType.HOSPITAL, AccountStatus.SUSPENDED);

        Hospital hospital = new Hospital();
        hospital.setUser(user);
        hospital.setMemberNumber(memberNumber);
        hospital.setName(req.getName());
        hospital.setBusinessNumber(req.getBusinessNumber());
        hospital.setAddress(req.getAddress());
        hospital.setPhone(req.getPhone());
        hospital.setFabricOrgId(req.getFabricOrgId());
        hospital.setAdminEmail(req.getAdminEmail());
        hospitalRepository.save(hospital);

        createPointBalance(PointOwnerType.HOSPITAL, hospital.getId());
        return pendingApprovalResponse(user, memberNumber);
    }

    // 보험사 등록 신청 (관리자 승인 대기)
    @Transactional
    public AuthResponse registerInsurance(InsuranceRegisterRequest req) {
        requireUnusedLoginId(req.getFabricOrgId(), DUPLICATE_ORG_ID);
        requireFalse(insuranceCompanyRepository.existsByFabricOrgId(req.getFabricOrgId()), DUPLICATE_FABRIC_ORG_ID);
        requireFalse(insuranceCompanyRepository.existsByBusinessNumber(req.getBusinessNumber()), DUPLICATE_BUSINESS_NUMBER);

        String memberNumber = uniqueInsuranceNumber();
        User user = createUser(req.getFabricOrgId(), req.getPassword(), MemberType.INSURANCE, AccountStatus.SUSPENDED);

        InsuranceCompany company = new InsuranceCompany();
        company.setUser(user);
        company.setMemberNumber(memberNumber);
        company.setName(req.getName());
        company.setBusinessNumber(req.getBusinessNumber());
        company.setFabricOrgId(req.getFabricOrgId());
        company.setAdminEmail(req.getAdminEmail());
        insuranceCompanyRepository.save(company);

        createPointBalance(PointOwnerType.INSURANCE, company.getId());
        return pendingApprovalResponse(user, memberNumber);
    }

    private User createUser(String loginId, String password, String memberType, String status) {
        User user = new User();
        user.setLoginId(loginId);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setMemberType(memberType);
        user.setStatus(status);
        userRepository.save(user);
        return user;
    }

    private void createPointBalance(String ownerType, Long ownerId) {
        PointBalance pointBalance = new PointBalance();
        pointBalance.setOwnerType(ownerType);
        pointBalance.setOwnerId(ownerId);
        pointBalance.setBalance(0);
        pointBalanceRepository.save(pointBalance);
    }

    private static AuthResponse pendingApprovalResponse(User user, String memberNumber) {
        return AuthResponse.builder()
                .userId(user.getId())
                .memberNumber(memberNumber)
                .memberType(user.getMemberType())
                .message(PENDING_APPROVAL_MESSAGE)
                .build();
    }

    // 토큰 갱신 (refresh token → new access token)
    @Transactional
    public AuthResponse refresh(String rawRefreshToken) {
        String tokenHash = jwtUtil.hashToken(rawRefreshToken);
        RefreshToken stored = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException("유효하지 않은 리프레시 토큰입니다."));
        if (Boolean.TRUE.equals(stored.getIsRevoked())) {
            throw new IllegalArgumentException("이미 사용된 리프레시 토큰입니다.");
        }
        if (stored.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("리프레시 토큰이 만료되었습니다.");
        }
        User user = stored.getUser();
        stored.setIsRevoked(true);
        refreshTokenRepository.save(stored);
        String memberNumber = resolveMemberNumber(user);
        return issueTokens(user, memberNumber, "토큰 갱신이 완료되었습니다.");
    }

    // 로그인 (모든 역할 공통)
    @Transactional
    public AuthResponse login(LoginRequest req) {
        User user = userRepository.findByLoginId(req.getLoginId())
                .orElseThrow(() -> new IllegalArgumentException("아이디 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        if (AccountStatus.SUSPENDED.equals(user.getStatus())) {
            throw new IllegalStateException("관리자 승인 대기 중인 계정입니다.");
        }
        if (AccountStatus.WITHDRAWN.equals(user.getStatus())) {
            throw new IllegalStateException("탈퇴한 계정입니다.");
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        // 이전 refresh token 전부 revoke — 동일 계정 중복 세션 방지
        refreshTokenRepository.revokeAllByUserId(user.getId());

        String memberNumber = resolveMemberNumber(user);
        return issueTokens(user, memberNumber, "로그인이 완료되었습니다.");
    }

    private AuthResponse issueTokens(User user, String memberNumber, String message) {
        String accessToken = jwtUtil.generateAccessToken(user.getId(), user.getMemberType());
        String rawRefreshToken = jwtUtil.generateRefreshTokenValue();
        String tokenHash = jwtUtil.hashToken(rawRefreshToken);

        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUser(user);
        refreshToken.setTokenHash(tokenHash);
        refreshToken.setExpiresAt(LocalDateTime.now().plusSeconds(jwtUtil.getRefreshTokenExpirationSeconds()));
        refreshTokenRepository.save(refreshToken);

        return AuthResponse.builder()
                .userId(user.getId())
                .memberNumber(memberNumber)
                .memberType(user.getMemberType())
                .accessToken(accessToken)
                .refreshToken(rawRefreshToken)
                .message(message)
                .build();
    }

    private String resolveMemberNumber(User user) {
        return switch (user.getMemberType()) {
            case MemberType.USER ->
                guardianRepository.findByUser_Id(user.getId())
                        .map(Guardian::getMemberNumber)
                        .orElse(null);
            case MemberType.HOSPITAL ->
                hospitalRepository.findByUser_Id(user.getId())
                        .map(Hospital::getMemberNumber)
                        .orElse(null);
            case MemberType.INSURANCE ->
                insuranceCompanyRepository.findByUser_Id(user.getId())
                        .map(InsuranceCompany::getMemberNumber)
                        .orElse(null);
            case MemberType.PLATFORM -> user.getLoginId();
            default -> null;
        };
    }

    private String uniqueUserNumber() {
        return uniqueNumber(IdentifierGenerator::generateUserNumber, guardianRepository::existsByMemberNumber);
    }

    private String uniqueHospitalNumber() {
        return uniqueNumber(IdentifierGenerator::generateHospitalNumber, hospitalRepository::existsByMemberNumber);
    }

    private String uniqueInsuranceNumber() {
        return uniqueNumber(IdentifierGenerator::generateInsuranceNumber, insuranceCompanyRepository::existsByMemberNumber);
    }

    private static String uniqueNumber(Supplier<String> generator, Predicate<String> exists) {
        for (int i = 0; i < 10; i++) {
            String number = generator.get();
            if (!exists.test(number)) {
                return number;
            }
        }
        throw new IllegalStateException(MEMBER_NUMBER_FAILURE);
    }

    private void requireUnusedLoginId(String loginId, String message) {
        requireFalse(userRepository.existsByLoginId(loginId), message);
    }

    private static void requireFalse(boolean condition, String message) {
        if (condition) {
            throw new IllegalArgumentException(message);
        }
    }
}
