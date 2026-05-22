#!/usr/bin/env bash
set -e

echo "=============================="
echo " PetChain 개발환경 설치 시작"
echo "=============================="

# 1. Java 21
echo ""
echo "[1/4] Java 21 설치 중..."
apt-get update -qq
apt-get install -y openjdk-21-jdk
update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java 2>/dev/null || true
echo "JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64" >> /etc/environment
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
java -version
echo "Java 21 설치 완료"

# 2. Node.js 20 (npm 포함)
echo ""
echo "[2/4] Node.js 20 설치 중..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -version
npm -version
echo "Node.js 설치 완료"

# 3. MySQL 8
echo ""
echo "[3/4] MySQL 설치 중..."
DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server
systemctl start mysql
systemctl enable mysql
# root 비밀번호 1234로 설정 + petchain DB 생성
mysql -u root <<'SQL'
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '1234';
CREATE DATABASE IF NOT EXISTS petchain CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
FLUSH PRIVILEGES;
SQL
echo "MySQL 설치 완료 (root 비밀번호: 1234, DB: petchain)"

# 4. .gradle / build 권한 수정
echo ""
echo "[4/4] Gradle 캐시 권한 수정 중..."
BACKEND_DIR="/home/ubuntu/workspace/petchain/pointpro/be/backend"
chown -R ubuntu:ubuntu "$BACKEND_DIR/.gradle" 2>/dev/null || true
chown -R ubuntu:ubuntu "$BACKEND_DIR/build"   2>/dev/null || true
echo "권한 수정 완료"

echo ""
echo "=============================="
echo " 설치 완료!"
echo "=============================="
echo "Java:  $(java -version 2>&1 | head -1)"
echo "Node:  $(node -v)"
echo "npm:   $(npm -v)"
echo "MySQL: $(mysql --version)"
echo ""
echo "이제 아래 명령어로 실행하세요:"
echo "  백엔드: cd be/backend && ./gradlew bootRun"
echo "  프론트: cd fe/petchain && npm install && npm run dev"
