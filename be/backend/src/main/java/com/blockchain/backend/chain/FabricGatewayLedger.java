package com.blockchain.backend.chain;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.stream.Stream;

import org.hyperledger.fabric.client.Contract;
import org.hyperledger.fabric.client.Gateway;
import org.hyperledger.fabric.client.identity.Identities;
import org.hyperledger.fabric.client.identity.Identity;
import org.hyperledger.fabric.client.identity.Signer;
import org.hyperledger.fabric.client.identity.Signers;
import org.hyperledger.fabric.client.identity.X509Identity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import io.grpc.ManagedChannel;
import io.grpc.netty.shaded.io.grpc.netty.GrpcSslContexts;
import io.grpc.netty.shaded.io.grpc.netty.NettyChannelBuilder;
import jakarta.annotation.PreDestroy;

/**
 * chain.enabled=true 일 때 실제 Hyperledger Fabric Gateway에 연결하는 구현.
 * peer TLS 인증서와 클라이언트 X.509 신원을 CHAIN_* 환경변수(application.properties)로 주입받는다.
 */
@Component
@ConditionalOnProperty(name = "chain.enabled", havingValue = "true")
public class FabricGatewayLedger implements PetChainLedger {

    private static final Logger log = LoggerFactory.getLogger(FabricGatewayLedger.class);

    private final Gateway gateway;
    private final Contract contract;

    public FabricGatewayLedger(ChainProperties props) throws Exception {
        // peer로 향하는 gRPC(TLS) 채널
        var tls = GrpcSslContexts.forClient()
                .trustManager(Files.newInputStream(Path.of(props.getTlsCertPath())))
                .build();
        ManagedChannel grpcChannel = NettyChannelBuilder
                .forTarget(props.getPeerEndpoint())
                .sslContext(tls)
                .overrideAuthority(props.getPeerHostOverride())
                .build();

        // 클라이언트 X.509 인증서
        X509Certificate cert;
        try (var reader = Files.newBufferedReader(Path.of(props.getCertPath()))) {
            cert = Identities.readX509Certificate(reader);
        }
        Identity identity = new X509Identity(props.getMspId(), cert);

        // 클라이언트 개인키 (keystore 디렉토리 내 *_sk 파일)
        Path keyFile;
        try (Stream<Path> stream = Files.list(Path.of(props.getKeyDir()))) {
            keyFile = stream.findFirst().orElseThrow(
                    () -> new IllegalStateException("keyDir 에 개인키 파일이 없습니다: " + props.getKeyDir()));
        }
        PrivateKey pk;
        try (var reader = Files.newBufferedReader(keyFile)) {
            pk = Identities.readPrivateKey(reader);
        }
        Signer signer = Signers.newPrivateKeySigner(pk);

        // Gateway 연결 → 채널/체인코드 컨트랙트
        this.gateway = Gateway.newInstance()
                .identity(identity)
                .signer(signer)
                .connection(grpcChannel)
                .connect();
        this.contract = gateway.getNetwork(props.getChannel()).getContract(props.getChaincode());

        log.info("Fabric Gateway 연결 완료 — peer={} channel={} chaincode={}",
                props.getPeerEndpoint(), props.getChannel(), props.getChaincode());
    }

    @PreDestroy
    public void close() {
        try { gateway.close(); } catch (Exception ignored) {}
    }

    @Override
    public boolean isEnabled() { return true; }

    // ── submit/eval 헬퍼 ─────────────────────────────────────────────────────

    /**
     * 트랜잭션을 제출하고 Fabric TxID(64자 hex)를 반환한다.
     * contract.submitTransaction()은 체인코드 응답 payload를 반환하므로
     * newProposal → build → endorse → submit 흐름으로 TxID를 별도 추출한다.
     * VARCHAR(64) 컬럼에 저장 가능한 길이가 보장된다.
     */
    private String submit(String fn, String... args) {
        try {
            var transaction = contract.newProposal(fn)
                    .addArguments(args)
                    .build();
            String txId = transaction.getTransactionId();
            transaction.endorse().submit();
            return txId;
        } catch (Exception e) {
            throw new RuntimeException("chaincode submit 실패: " + fn + " — " + e.getMessage(), e);
        }
    }

    private String eval(String fn, String... args) {
        try {
            return new String(contract.evaluateTransaction(fn, args), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("chaincode query 실패: " + fn + " — " + e.getMessage(), e);
        }
    }

    // ── PetChainLedger 구현 ──────────────────────────────────────────────────

    @Override
    public String registerRecord(String recordId, String hospitalId, String recordHash,
                                String attachJson, String createdAt) {
        return submit("RegisterRecord", recordId, hospitalId, recordHash, attachJson, createdAt);
    }

    @Override
    public String registerConsent(String consentId, String recordId, String insurerId,
                                String guardianHash, String validUntil, String createdAt) {
        return submit("RegisterConsent", consentId, recordId, insurerId, guardianHash, validUntil, createdAt);
    }

    @Override
    public String revokeConsent(String consentId, String revokedAt, String reason) {
        return submit("RevokeConsent", consentId, revokedAt, reason);
    }

    @Override
    public String createSubmissionWithConsent(String subId, String recordId, String consentId,
                                            String hospitalId, String insurerId,
                                            String recordHashAtSubmit, String createdAt) {
        return submit("CreateSubmissionWithConsent",
                subId, recordId, consentId, hospitalId, insurerId, recordHashAtSubmit, createdAt);
    }

    @Override
    public String recordVerification(String verId, String subId, String status, String failJson,
                                    String recordHashAtVerify, String consentSnapshot,
                                    String verifiedAt, String auditLogId) {
        return submit("RecordVerification",
                verId, subId, status, failJson, recordHashAtVerify, consentSnapshot, verifiedAt, auditLogId);
    }

    @Override
    public String processSuccessfulVerification(String verId, String subId, String recordHashAtVerify,
                                                String consentSnapshot, String verifiedAt,
                                                String auditLogId, String idem) {
        return submit("ProcessSuccessfulVerification",
                verId, subId, recordHashAtVerify, consentSnapshot, verifiedAt, auditLogId, idem);
    }

    @Override
    public String issuePoints(String insurerId, String amount, String issuedBy, String issuedAtIso) {
        return submit("IssuePoints", insurerId, amount, issuedBy, issuedAtIso);
    }

    @Override
    public String confirmPointPurchase(String pid, String insurerId, String amount, String paymentId,
                                        String orderId, String paidAt, String by, String idem) {
        return submit("ConfirmPointPurchase",
                pid, insurerId, amount, paymentId, orderId, paidAt, by, idem);
    }

    @Override
    public long getPointBalance(String insurerId) {
        String raw = eval("GetPointBalance", insurerId);
        try {
            // 체인코드는 {"insurerId":"...","balance":N} JSON을 반환한다.
            // replaceAll("[^0-9\\-]","")는 insurerId 내 숫자까지 추출해 오답을 낸다.
            // "balance" 키의 값만 정확히 추출한다.
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("\"balance\"\\s*:\\s*(-?\\d+)")
                    .matcher(raw);
            return m.find() ? Long.parseLong(m.group(1)) : 0L;
        } catch (Exception e) {
            return 0L;
        }
    }
}
