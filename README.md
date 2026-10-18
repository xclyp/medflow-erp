# MedFlow ERP

> 独立采购、主数据与财务协同系统 · v0.3.0 · 开发验证版

负责供应商、药品主数据、采购到货、应收应付与平衡凭证；库存事实由WMS回执确认。

## 项目状态

本仓库是可独立运行的业务应用，拥有自己的源码、进程、数据库、认证入口、收件箱、发件箱和审计记录。它与其他 MedFlow 应用通过 HTTP 消息协作，不直接读取其他系统数据库。

当前版本用于架构验证、业务演示和二次开发。它尚未完成生产高可用、容量压测、灾备演练、真实设备联调和医药计算机化系统验证，不能仅凭本仓库直接用于药品生产经营。

## 核心能力

- 供应商与药品主数据
- 包装换算、温区与销售价格
- 采购订单审核和分批ASN
- 按WMS实际入库数量生成采购应付
- 商品应收、BMS服务应收与分次收付款
- 会计科目、借贷平衡凭证和业务审计

## 系统边界

- 到货通知不提前生成应付，只有WMS实际入库才确认采购负债。
- 商品应收与BMS服务应收分开核算。
- 本系统使用整数分模拟金额，不包含税控、发票平台或法定总账结账。

MedFlow 六套应用的职责：ERP 管主数据、采购与财务；OMS 管订单；WMS 管仓内库存；WCS 管设备任务；TMS 管运输；BMS 管服务计费。每套应用必须使用独立数据库。

## 技术栈

- React 19 + TypeScript
- Vinext / Vite 8
- Cloudflare Workers 运行时
- Cloudflare D1 + Drizzle ORM
- 持久化发件箱、收件箱、请求幂等与操作审计

运行时要求：Node.js 22.13 或更高版本。推荐使用 Git、PowerShell 7 或 Bash。生产部署需要 Cloudflare Workers 与 D1，或自行完成对其他运行时和数据库的适配。

## 快速开始

```bash
git clone https://github.com/YOUR-ACCOUNT/medflow-erp.git
cd medflow-erp
node scripts/install-ci.mjs
copy .env.example .dev.vars
node scripts/db-local.mjs
node scripts/run-framework.mjs dev --port 5175
```

Windows 无法使用 `copy` 以外的 shell 时，可在资源管理器复制 `.env.example` 并重命名为 `.dev.vars`。WMS 如没有示例文件，可手工创建该文件。

浏览器访问：

```text
http://127.0.0.1:5175/
```

首次运行可初始化空系统或演示资料。初始化操作不能覆盖已经存在的数据。开发服务必须保持终端窗口开启，按 `Ctrl+C` 停止。

## 本地配置

`.dev.vars` 只用于本地，已被 Git 忽略。值直接填写，不要把整段 JSON 再额外编码成带转义符的字符串。

```dotenv
INTEGRATION_KEY=至少32字符的随机服务密钥
PEERS_JSON={"wms":{"url":"http://127.0.0.1:5173"},"oms":{"url":"http://127.0.0.1:5174"},"bms":{"url":"http://127.0.0.1:5176"}}
```

- `INTEGRATION_KEY`：后端服务间 Bearer 凭据，至少32字符。生产环境应使用密码管理器生成并定期轮换。
- `PEERS_JSON`：目标系统地址。私有站点可为目标增加 `gateToken`，该值只能保存在服务端环境变量。
- 不要提交 `.dev.vars`、数据库、访问令牌、客户数据或生产日志。
- 本地六系统默认端口：WMS 5173、OMS 5174、ERP 5175、BMS 5176、TMS 5177、WCS 5178。

## 数据库

本项目使用 D1 与 Drizzle。迁移文件位于 `drizzle/`，本地状态位于被忽略的 `.wrangler/state/`。

```bash
node scripts/db-local.mjs
```

生产环境应为本系统创建专用 D1 数据库，先备份再迁移，并在发布前验证迁移结果。禁止六套系统共用同一个 D1 数据库。备份至少覆盖数据库、环境变量、部署版本和恢复操作记录。

## 操作指引

1. 维护供应商、药品、包装和售价。
2. 将药品主数据同步到OMS与WMS。
3. 创建并审核采购单。
4. 按采购明细创建分批到货通知并发送WMS。
5. 收到WMS实际入库回执后核对采购应付。
6. 收到WMS发货依据后登记商品应收；接收BMS服务应收与收款。
7. 登记采购付款和商品收款，检查凭证借贷平衡。

金额字段使用整数分，数量按药品基本单位计算。列表中的业务ID、订单ID和费用ID必须复制真实值，不能把说明文字当作ID填写。

## 系统集成

接收事件：

- wms.inbound.stored：WMS实际入库
- wms.outbound.shipped：WMS实际发货依据
- bms.bill.approved：服务账单
- bms.payment.received：服务费收款

发送事件：

- master.product.upsert → OMS / WMS
- erp.receipt.expected → WMS

浏览器业务接口为 `/api/app` 和 `/api/erp`；集成发送为 `/api/integration/dispatch`；服务收件为 `/api/integration/inbox`。

业务操作和待发消息在同一事务中保存。发送成功必须收到对端 `accepted: true` 且消息ID一致；失败消息会保留，目标恢复后在“接口与消息”中点击“发送/重试待发消息”。当前没有后台自动调度器。

服务间请求示意：

```http
POST /api/integration/inbox
Authorization: Bearer <INTEGRATION_KEY>
Content-Type: application/json

{
  "id": "唯一消息ID",
  "source": "erp",
  "target": "erp",
  "type": "业务事件类型",
  "correlationId": "业务关联ID",
  "at": "2026-10-18T08:00:00.000Z",
  "payload": {}
}
```

接收端按消息ID持久化去重。调用方重试时必须复用原消息ID，不能每次生成新ID。

## 构建、检查与测试

```bash
node scripts/run-framework.mjs build
node --experimental-strip-types --test tests/domain.test.ts
npx tsc --noEmit
npx eslint . --ignore-pattern dist --ignore-pattern .next
```

也可以使用 `npm run build`、`npm test`、`npm run typecheck` 和 `npm run lint`。提交代码前至少完成领域测试、类型检查和生产构建。涉及跨系统合同的变更还必须运行六系统 HTTP 联调。

## 部署

### Cloudflare Workers / D1

1. 创建本系统专用的 D1 数据库。
2. 将绑定名称设置为 `DB`，并为生产环境配置真实 `database_id`。
3. 对远端数据库应用 `drizzle/` 中的迁移。
4. 将 `INTEGRATION_KEY`、`PEERS_JSON`配置为平台密钥或环境变量。
5. 执行生产构建：`node scripts/run-framework.mjs build`。
6. 检查 `dist/server/wrangler.json`，将占位数据库和环境配置替换为目标账户资源。
7. 发布 Worker，随后检查 `/api/health`、登录、数据库读写和消息收发。

生成的部署配置与当前平台绑定有关，不应未经检查直接用于另一个 Cloudflare 账户。普通 Windows/Linux 服务器不能直接运行 D1 代码；若要部署到传统服务器，需要替换 Workers 绑定、认证入口和数据库适配层。

### 发布检查

- 使用独立的测试、预生产和生产环境。
- 在发布前备份数据库并记录恢复点。
- 验证 HTTPS、登录、服务凭据、同源保护和最小权限。
- 执行数据库迁移、冒烟测试和消息重试测试。
- 监控错误率、队列积压、D1容量、延迟和异常审计。
- 准备回滚版本与数据库恢复方案。

## 安全要求

- 浏览器身份与服务身份分开验证；不要把服务密钥发给浏览器。
- 生产环境必须使用强随机密钥、HTTPS、密钥轮换和访问日志。
- 不信任客户端传入的角色、金额、库存、设备状态或完成标记。
- 公开仓库前检查 Git 历史，确认没有 `.dev.vars`、客户数据、数据库和令牌。
- 根据企业要求增加多角色RBAC、双人复核、会话策略、审计导出和告警。

## 故障排查

| 现象 | 检查项 |
|---|---|
| `ERR_MODULE_NOT_FOUND` | 依赖未安装，或移动目录后 `node_modules` 连接失效 |
| 页面能打开但数据请求失败 | 是否执行迁移、数据库是否绑定为 `DB`、用户是否登录 |
| “服务地址配置无效” | `PEERS_JSON` 必须是合法JSON对象，不能双重转义 |
| “通信凭据未配置” | 检查 `INTEGRATION_KEY` 是否加载且不少于32字符 |
| 消息一直待发送 | 目标系统是否启动、URL/凭据是否正确、目标收件箱是否返回确认 |
| 重复业务记录 | 重试是否复用原 `requestId` 和消息ID |
| 端口被占用 | 停止旧进程，或使用另一个 `--port` |

## 已知限制

- 不是完整制造ERP，不包含BOM、MRP、生产计划、成本核算和MES。
- 会计能力用于业务闭环验证，不能替代法定财务、税务和发票系统。
- 没有银行、电子发票、供应商门户等外部连接器。

此外，当前版本未完成企业级多角色权限、大数据分页、异步调度、高并发压测、多区域灾备、生产监控和药品GxP验证。

## 医药合规说明

本项目不附带GMP/GSP验证结论。实际投入使用前，应由业务、质量、信息化和设备团队完成URS、风险评估、设计确认、安装确认、运行确认、性能确认、数据完整性评估、审计追踪复核、备份恢复演练、权限矩阵和变更控制。任何仿真、人工录入或演示数据都不能冒充真实设备、真实签收或法定财务记录。

## 目录结构

```text
app/          页面与API路由
components/   通用界面组件
lib/          领域规则、存储、认证与集成逻辑
db/           数据库Schema
drizzle/      数据库迁移
scripts/      安装、构建与本地数据库工具
tests/        领域与集成测试
public/       静态资源
```

## 参与开发

1. 从 `main` 创建功能分支。
2. 保持单次提交范围清晰，不提交生成数据库和密钥。
3. 为重要领域规则补充测试。
4. 运行测试、类型检查、lint和构建。
5. 在PR中说明业务行为、迁移影响、接口兼容性和验证证据。

## 许可证

仓库公开前请在根目录添加明确的 `LICENSE`。没有许可证时，默认版权规则仍然适用；仅公开可见不等于允许他人复制、修改和分发。可根据项目策略选择 MIT、Apache-2.0 或其他经确认的许可证。
