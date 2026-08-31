## 缠论算法验证

仓库提供逐 K 回放验证命令。回放只使用每个时点已经出现的 K 线，信号按首次确认时间记录，并从下一根 K 线开盘价开始评估，避免使用三角形所在历史位置产生未来函数。

抓取内置的 23 个代表性 A 股/指数样本（日线、周线和 60 分钟线）：

```powershell
npm run fetch:chan-data
```

默认写入 `.chan-validation/expanded-input.json`。日线和周线使用后复权数据，采集器会裁掉无效复权价格；分钟 K 线不复权。也可通过 `--symbols`、`--periods` 和 `--concurrency` 自定义样本。

准备 `.chan-validation/input.json`：

```json
{
  "datasets": [
    {
      "symbol": "sh600519",
      "period": "day",
      "assetType": "stock",
      "source": "qfq",
      "points": [
        {
          "time": "2026-01-05",
          "open": 100,
          "high": 103,
          "low": 99,
          "close": 102,
          "volume": 120000
        }
      ]
    }
  ]
}
```

支持 `day`、`week`、`month`、`5m`、`15m`、`30m`、`60m`。`assetType` 支持 `stock`、`index`、`etf`、`fund`、`unknown`，省略时根据代码推断。同一数据集的时间必须严格递增，OHLC 和成交量必须是有效数字。

运行验证：

```powershell
npm run validate:chan -- ./.chan-validation/input.json ./.chan-validation/report.json "5,10,20" 3 2 5
```

位置参数依次为输入文件、输出文件、持有周期、单边手续费基点、单边滑点基点和股票卖出印花税基点。直接运行 `node out/chan/validationCli.js` 时还支持 `--sell-tax-bps`、`--development-ratio`、`--regime-ma-bars`、`--regime-slope-bars` 和 `--regime-threshold`。

报告默认按时间 70/30 划分开发集和留出集，跨越切分点的持仓不会进入任一侧；留出集保留此前历史作为结构预热。市场状态仅用信号当时可见的 MA60 及其 20 根斜率划分为牛市、熊市和震荡。

报告包含信号首次可见时间、确认延迟、追加 K 线后的消失或变更记录、下一根 K 线成交评估、胜率、平均/中位收益、盈亏比、信号序列回撤以及 MAE/MFE，并按开发/留出样本、周期、市场状态和一/二/三类买卖点生成切片。买点按多头交易扣除手续费、滑点和股票卖出印花税；卖点只衡量后续下跌跟随度，明确标记为不可执行裸空。`variantMetrics` 和 `variantOpportunityCoverage` 使用未经过展示层合并的完整规则命中，分别统计标准规则、局部背驰和独立二买；`opportunitySensitivity` 报告涨幅阈值上下 3% 与信号窗口上下 3 根的九组结果。同一输入和参数会产生一致的 JSON 报告。

算法 1.0.5 保持 1.0.4 的买卖点判定不变，统一生产与验证的市场状态计算，并将展示事件和规则命中分开统计。使用冻结的 40 标的、80 组日线/周线和 49,377 根 K 线做兼容性重算后，1,710 个展示信号及 ID 完全不变，1,731 条规则命中均纳入审计，稳定性违规为 0；及时买点覆盖率仍为 29.8%，标准规则独立覆盖率按修正口径为 15.1%。阈值上下 3% 且保持 8 根信号窗口时，覆盖率为 28.6%-29.8%。该重算只验证口径兼容性，不将已查看的验收集重新用于调参。周线独立二买仍只用于观察中期结构；日线/分钟级补充买点和补充卖点保持关闭。
