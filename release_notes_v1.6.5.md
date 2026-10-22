# Rclone Drive & Sync v1.6.5 更新日誌

## 🚀 版本亮點概述

此版本主要更新並升級核心建置工具與前端依賴套件，確保模組解析最佳化與打包相容性：

---

### 1. ⚡ 核心建置環境升級
- **Vite 升級至 v8.3.5**：提升熱重載（HMR）效能與相容性支援。
- **Rolldown 打包器升級至 v1.2.15**：增強多平台原生綁定穩定度與打包速度。
- **PostCSS 升級至 v8.5.31** 與 **Nanoid 升級至 v3.3.20**：更新底層依賴，確保安全修補與最佳執行穩定性。

---

### 2. 📦 完整重新打包與校驗
- 重新使用 Tauri v2 + Rust 1.99.0 建置全新 release 安裝檔與單檔便攜版。
- 內建 SHA-256 完整性雜湊值與 checksums.txt 清單。

---

## 🔒 檔案校驗雜湊值 (SHA-256 Checksums)

為確保您下載的安裝檔為官方發布且未受任何第三方竄改，請比對以下 SHA-256 雜湊值：

| 檔案名稱 | SHA-256 雜湊值 |
| :--- | :--- |
| RcloneDrive_v1.6.5_x64_Setup.exe | 7b6adf2c25a54d588d165df6794ad187b612beaed6081d50c470956cb4648fc |
| RcloneDrive_v1.6.5_Portable_x64.exe | 3e7ef62370c5ea4963c4fc9681beabd0c630d1a03e71b37e85ccb04370884427 |
| RcloneDrive_v1.6.5_x64.msi | 15575d40effd13981a206b7604afdc7d9ce8a80b9d8e9614da6c71fc3245571d |

---

## 🛡️ 首次下載與防毒軟體提示說明

若您在下載或執行時遇到防毒軟體提示「資訊結果不明」或 Windows Defender SmartScreen 提示：
1. **解除提示**：
   - Windows SmartScreen：點選 **「其他資訊」** ➔ **「仍要執行」**。
2. **雜湊比對驗證**：在 PowerShell 執行 Get-FileHash <檔案路徑> -Algorithm SHA256，比對輸出與上方 Checksum 一致，即可 100% 確保安全性。
