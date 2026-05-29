# Pintoo — 線上拼圖工具

將上傳的圖片切成拼圖碎片，支援五種難易度，在瀏覽器內直接遊玩。支援電腦與手機。

## 功能

- 上傳圖片（拖曳或點擊選擇）
- 五種難易度：3×3 至 12×12
- 經典凹凸拼圖造型
- 拖曳放置、自動吸附
- 左側／彈出參考圖、計時與進度
- 手機優化介面

## 本機預覽

```bash
# Python
python -m http.server 8080

# 或 Node.js
npx serve .
```

瀏覽器開啟 `http://localhost:8080`。

## 部署到 GitHub + Render

本專案為**純靜態網站**（HTML / CSS / JS），無需後端與建置步驟。

### 1. 推送到 GitHub

在專案資料夾執行（若尚未初始化）：

```bash
git init
git add .
git commit -m "Initial commit: Pintoo 線上拼圖"
```

到 [GitHub](https://github.com/new) 建立新儲存庫（例如 `pintoo`），**不要**勾選 README（本專案已有）。

```bash
git remote add origin https://github.com/你的帳號/pintoo.git
git branch -M main
git push -u origin main
```

### 2. 在 Render 建立靜態網站

1. 登入 [Render](https://render.com/)
2. **New +** → **Static Site**
3. 連接你的 GitHub 帳號，選擇 `pintoo` 儲存庫
4. 設定：
   - **Name**：`pintoo`（或自訂）
   - **Branch**：`main`
   - **Build Command**：留空
   - **Publish Directory**：`.`（專案根目錄）
5. 點 **Create Static Site**

部署完成後會得到網址，例如：`https://pintoo.onrender.com`

### 使用 Blueprint（可選）

專案內含 `render.yaml`，也可在 Render 選 **New +** → **Blueprint**，連接同一儲存庫一鍵部署。

## 檔案結構

| 檔案 | 說明 |
|------|------|
| `index.html` | 頁面結構 |
| `styles.css` | 樣式 |
| `app.js` | 拼圖邏輯 |
| `render.yaml` | Render 部署設定 |

## 授權

MIT
