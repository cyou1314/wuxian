# Dola API 链路定稿（REA 逆向成果，2026-10-11 ~ 10-16）

原始抓包与分析笔记：`workspace/dola-research/notes.md`（VM 本地）。本文件为可执行定稿。

## 视频生成链路

1. 取配置：`POST /samantha/skill/pack` body `{"skill_type":17}`
   → 模型 / 比例 / 时长选项。只读接口，VM 可直调，无需签名。
2. 提交：`POST /chat/completion`（SSE），核心字段：
   - `chat_ability = {"ability_type": 17, "ability_param": "{\"model\":\"seedance_v2.5\",\"duration\":10,\"input_box_content\":{\"user_input_content\":\"<prompt>\",\"reply_message_format\":\"生成视频：%s\"}}"}`
   - 用户消息文本：`生成视频：<prompt>`
   - SSE 事件序列：`SSE_ACK`（回填 conversation_id）→ `FULL_MSG_NOTIFY` → `STREAM_CHUNK`×n → `DOWNLINK_CMD` → `SSE_REPLY_END`
   - **配额文本在 STREAM_CHUNK 里**：「本次使用 Dreamina Seedance 2.5 生成，将消耗 4 个视频生成额度，预计等待 10 分钟。…今日剩余 0 个视频生成额度。」——无独立配额 API，靠流文本解析。
3. 轮询：`POST /im/chain/single` body `{"cmd":3100,"uplink_body":{"pull_singe_chain_uplink_body":{"conversation_id":"<id>","anchor_index":5,"conversation_type":3,"direction":1,"limit":20,...}}}`
   → 成品消息 `creation_block.creations[0] = {type:2, video:{vid:"<vid>", cover:{...}}}`
4. 取链：`POST /samantha/video/get_play_info` body `{"vid":"<vid>"}`
   → `data.play_infos[0].main` 为带签名 mp4 直链（原文件，无水印）。

## 图片生成

- `skill_type = ability_type = 3`（SkillImageGen，TS 枚举三处独立印证，与 `SkillVideoGeneration=17` 同枚举）
- 配置：`POST /samantha/skill/pack {"skill_type":3}`（8 大类、比例选项已确认）
- 提交走同一套 `/chat/completion`，`ability_type=3`；内层 param schema 待一次带响应正文的抓包确认

## 30 秒

- 非独立接口：`ability_param.duration` 直接传 `30` 即可
- Deck 曾用改写 `/samantha/skill/pack` 响应实现时长选项扩展；纯接口调用后这步可省

## 签名现实（硬约束）

- 写入接口强制验 `a_bogus` / `msToken`：VM 机房出口裸调一律 `710022002`（伪装成 "high demand"）
- 只读接口不验：`skill/pack` VM 直调返回 `code 0`
- 可行路线：在**已登录真实页面上下文**里发请求（cookie + 页面自带签名函数都在）
- 签名器已归档：`workspace/dola-research/vendor/webmssdk_1.0.0.44.es5.js`（byted_acrawler，暂不需要复刻）

## skill_type 扫描（1..30，code=0 的）

| type | skill |
| ---- | ----- |
| 2 | write |
| 3 | image |
| 4 | search |
| 5 | translate |
| 6 | ai_reader |
| 17 | video_generation |

## 现有代码资产（VM 本地）

- `~/workspace/deck-0540/src/dola-api.js`（528 行，未发布）：skill/pack、`/chat/completion` SSE 解析、轮询、取链一条龙 `generateVideo()`
- `~/workspace/your_files/dola_client.py`：纯服务端双模式客户端
- `~/workspace/your_files/reverse-engineer-anything.zip`：REA 双模式 skill
