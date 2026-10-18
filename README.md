# MedFlow ERP v0.3

独立ERP业务应用，固定的独立入口、源码、运行进程和自有D1数据库。

网址：https://medflow-erp-independent.jauntysiren17.chatgpt.site

## 功能

供应商、药品主数据、采购审核、分批到货通知、实际入库应付、商品及服务应收、分次收付款、科目与借贷平衡凭证。

本应用通过真实HTTP收发件箱协作；只在对端确认accepted和相同messageId后标记送达，发送失败保留记录重试。接收消息幂等并与本地业务同事务保存。其他系统离线时本地业务仍可进行，跨系统结果等待消息确认。

## 启动

Node.js 22.13+，安装package-lock对应依赖，然后：

    node scripts/run-framework.mjs build
    node scripts/db-local.mjs
    node scripts/run-framework.mjs dev --port 5175

首次进入选择空系统或演示资料，禁止覆盖已初始化数据。金额输入使用整数分，数量使用基本单位；包装换算按药品资料维护。多行单据当前支持JSON明细输入，单行OMS有快捷表单。

## 配置与接口

- 浏览器API：GET/POST /api/app（以及/api/erp）。操作名称见lib/app-config.ts与lib/domain.ts。写入需要requestId和同源Origin。
- 收件：POST /api/integration/inbox，Authorization: Bearer INTEGRATION_KEY。
- 发件状态：GET /api/integration；发送/重试：POST /api/integration/dispatch。每批最多25条，当前需要手动触发。
- INTEGRATION_KEY至少32字符；PEERS_JSON包含目标系统url与私有站点gateToken，仅后端环境变量可读。不同应用必须绑定不同数据库。
- 本地敏感值放不提交的.dev.vars；部署使用平台环境变量；源码不含生产密钥。

数据库按实体行存储，使用版本CAS、事务、请求幂等、独立收件箱及操作审计。当前页面读取本系统工作集，尚未完成大规模分页查询和压测。

## 交付边界

可运行的开发验证版；当前为各应用所有者管理，未提供多岗企业RBAC、法定财务凭证/税务系统、运输地图/承运商API、真实PLC/PDA/打印设备联调、医药合规验证、生产高可用与备份恢复演练。不能称为绝对完善或直接投入医药生产运营。
