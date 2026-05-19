# Hướng dẫn tạo proxy 9Router mới trên VPS

## Yêu cầu trước khi bắt đầu

- VPS Ubuntu đã cài Docker
- Tailscale đã cài và join network (hoặc domain + Nginx)
- Biết Tailscale IP của VPS (lệnh `tailscale ip -4`)

---

## Bước 1: Chọn tên và port

Quy ước: mỗi instance phải có **tên container khác nhau**, **port khác nhau**, **volume khác nhau**.

```
Instance khách hàng A:  vip-9router-a   → port 20128 → volume vip-9router-data-a
Instance khách hàng B:  vip-9router-b   → port 20129 → volume vip-9router-data-b
Instance khách hàng C:  vip-9router-c   → port 20130 → volume vip-9router-data-c
```

Kiểm tra port chưa bị dùng:
```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

---

## Bước 2: Tạo và fix permission cho volume

**Quan trọng:** image `decolua/9router` có lỗi permission với named volume, phải fix trước.

```bash
# Đặt biến tên (đổi cho mỗi instance)
NAME=vip-9router-c
PORT=20130
PASSWORD=YourStrongPassword123

# Tạo volume và fix permission
docker run --rm \
  -v ${NAME}-data:/var/lib/9router \
  busybox \
  sh -c "mkdir -p /var/lib/9router/db && chmod -R 777 /var/lib/9router"
```

---

## Bước 3: Chạy container

```bash
docker run -d \
  --name ${NAME} \
  --restart unless-stopped \
  -p ${PORT}:20128 \
  -v ${NAME}-data:/var/lib/9router \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e INITIAL_PASSWORD=${PASSWORD} \
  -e DATA_DIR=/var/lib/9router \
  -e PORT=20128 \
  decolua/9router:latest
```

Kiểm tra:
```bash
docker ps --filter "name=${NAME}"
curl http://localhost:${PORT}/api/health
docker logs ${NAME} --tail 20
```

Phải thấy `✓ Ready in 0ms` trong logs và `{"ok":true}` từ curl.

---

## Bước 4: Cấu hình trong Dashboard

Mở browser:
```
http://<tailscale-ip>:<PORT>/dashboard
```

Đăng nhập bằng password đặt ở `INITIAL_PASSWORD`.

**4a. Tạo API key:**
- Settings → API Keys → Generate
- Đặt tên (ví dụ "customer-c-key")
- Copy key ra, lưu lại — chỉ hiện 1 lần

**4b. Thêm providers:**
- Providers → Add
- Chọn provider (Claude Code, OpenRouter, Gemini...)
- Authenticate qua OAuth hoặc paste API key
- Test connection — phải thấy "active"

**4c. Tạo Combo (khuyến khích):**
- Models → Combos → New
- Đặt tên (ví dụ "best")
- Thêm models theo thứ tự ưu tiên
- Strategy: `fallback`

**4d. Bật RTK Token Saver:**
- Settings → bật "Compress tool output (RTK)"
- Tiết kiệm 20-40% token

**4e. Bảo mật:**
- Settings → bật "Require API Key"
- Settings → bật "Require Login"

---

## Bước 5: Cung cấp endpoint cho khách hàng

```
Endpoint: http://<tailscale-ip>:<PORT>/v1
API Key:  <key đã generate ở bước 4a>
Model:    <combo name hoặc model cụ thể, ví dụ "best">
```

**Cấu hình cho từng IDE:**

Claude Code:
```bash
export ANTHROPIC_BASE_URL=http://<tailscale-ip>:<PORT>/v1
export ANTHROPIC_AUTH_TOKEN=sk_xxx
```

VS Code Cline:
```json
{
  "cline.apiProvider": "openai",
  "cline.openAiBaseUrl": "http://<tailscale-ip>:<PORT>/v1",
  "cline.openAiApiKey": "sk_xxx",
  "cline.openAiModelId": "best"
}
```

Cursor → Settings → Models → OpenAI-compatible:
```
Base URL: http://<tailscale-ip>:<PORT>/v1
API Key:  sk_xxx
```

---

## Bước 6: Verify từ máy khách hàng

```bash
# Test endpoint
curl http://<tailscale-ip>:<PORT>/api/health

# Test chat completion
curl http://<tailscale-ip>:<PORT>/v1/chat/completions \
  -H "Authorization: Bearer sk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"best","messages":[{"role":"user","content":"Hello"}]}'
```

---

## Quản lý container

```bash
# Xem trạng thái
docker ps --filter "name=vip-9router"

# Xem logs
docker logs vip-9router-c --tail 50 -f

# Restart
docker restart vip-9router-c

# Stop (không xóa data)
docker stop vip-9router-c

# Update lên version mới
docker pull decolua/9router:latest
docker stop vip-9router-c
docker rm vip-9router-c
# Chạy lại lệnh ở Bước 3 — data trong volume vẫn giữ nguyên
```

---

## Xóa hoàn toàn 1 instance (cẩn thận)

```bash
NAME=vip-9router-c

docker stop ${NAME}
docker rm ${NAME}
docker volume rm ${NAME}-data   # ⚠️ XÓA TOÀN BỘ DATA
```

---

## Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `EACCES: permission denied` | Volume không có quyền ghi | Chạy lại Bước 2 |
| `port already in use` | Port đã dùng bởi container khác | Đổi `${PORT}` |
| `cloudflared exited with code 1` | Cloudflare Tunnel không cấu hình | Bỏ qua, không cần |
| `409 Conflict` khi `docker run` | Tên container đã tồn tại | `docker rm <name>` trước |
| Provider 403 sau OAuth | Account bị provider revoke | Xóa, dùng account khác |

---

## Checklist nhanh khi tạo instance mới

```
□ Đổi NAME, PORT, PASSWORD ở đầu lệnh
□ Bước 2: fix permission cho volume
□ Bước 3: docker run thành công
□ curl /api/health trả về {"ok":true}
□ Login dashboard được
□ Generate API key
□ Thêm ít nhất 1 provider, test "active"
□ Tạo combo (nếu có nhiều provider)
□ Bật RTK + Require API Key
□ Test từ máy client qua Tailscale
```
