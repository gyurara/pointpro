package com.blockchain.backend.petchainLOGIN.controller;

import com.blockchain.backend.petchainLOGIN.dto.request.*;
import com.blockchain.backend.petchainLOGIN.dto.response.AuthResponse;
import com.blockchain.backend.petchainLOGIN.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // 보호자(user) 회원가입
    @PostMapping("/register/user")
    public ResponseEntity<AuthResponse> registerUser(@Valid @RequestBody UserRegisterRequest req) {
        return ResponseEntity.ok(authService.registerUser(req));
    }

    // 병원 등록 신청
    @PostMapping("/register/hospital")
    public ResponseEntity<AuthResponse> registerHospital(@Valid @RequestBody HospitalRegisterRequest req) {
        return ResponseEntity.ok(authService.registerHospital(req));
    }

    // 보험사 등록 신청
    @PostMapping("/register/insurance")
    public ResponseEntity<AuthResponse> registerInsurance(@Valid @RequestBody InsuranceRegisterRequest req) {
        return ResponseEntity.ok(authService.registerInsurance(req));
    }

    // 로그인 (모든 역할 공통)
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest req) {
        return ResponseEntity.ok(authService.login(req));
    }

    // 토큰 갱신
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestBody java.util.Map<String, String> body) {
        String refreshToken = body.get("refreshToken");
        if (refreshToken == null || refreshToken.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(authService.refresh(refreshToken));
    }
}
