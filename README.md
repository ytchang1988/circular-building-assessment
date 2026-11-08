# BCI × EC × LCC 循環建築評估平台

> A bilingual (zh-TW / en) web app that calculates **Building Circularity
> Index (BCI)**, **Embodied Carbon (EC)**, and **Life-Cycle Cost (LCC)**
> for RC buildings in one integrated flow.

## 功能

- **8 類別明細表** (1-1 柱 / 1-2 梁 / 1-3 樓版 / 2-1 外牆 / 2-2 外裝 /
  2-3 外窗 / 3-1 內牆 / 3-2 地坪),每類支援 Excel / CSV 匯入、合併重複列、
  Shift+click 範圍選取與批次修改。
- **BCI 計算鏈** (CI-CON, CI-USE, CI-EOL, MCIp, PCI, SCIp) 完整實作,與原 Excel
  模型對驗差異 < 0.15%。
- **蘊含碳排 EC** 基準 vs 設計比較、減碳量、減碳比例。
- **物質流向** 桑基圖 (構造 → 6 材料類 → 7 廢棄物代碼)。
- **LCC 分析** 依建築研究所「結合 LCC 之循環建築整合評估模式」v5 規格,
  含結構 60 / 外裝 30 / 內裝 20 年壽命折現、情境 A vs B 綠色拆除、
  瀑布圖呈現各代碼貢獻。
- **範例專案** 一鍵載入楊梅 RC 案 (238 筆元件) 查看完整報表。

## 技術棧

Vite + React 18 + TypeScript + Tailwind CSS + Zustand + react-i18next + Recharts + ExcelJS

## 本機開發

```bash
cd web
npm install
npm run dev     # http://localhost:5173
npm run test    # vitest (78 tests)
npm run build   # production build → web/dist/
```

## 部署

Push 到 `main` 分支會自動經由 `.github/workflows/deploy.yml` 建置並發布到
GitHub Pages。首次使用需在 GitHub 專案設定中:

**Settings → Pages → Build and deployment → Source: GitHub Actions**

## 參考文件

- `web/src/templates/RC/UNIT_PRICES.md` — 資材單價來源 (營建物價 169 期)
- LCC 計算規格詳見建築研究所 115 年度報告 (未隨本 repo 公開)

## 授權

作者保留權利,如需使用請洽作者。
