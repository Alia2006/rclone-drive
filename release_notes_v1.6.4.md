# Rclone Drive & Sync v1.6.4 更新日誌

## 🚀 版本亮點概述

此版本修復了 **「官方平衡」與自訂模式下點擊「刷新快取」出現連線錯誤 (actively refused / 503)** 的問題：

---

### 1. 🛠️ 全面修復非預熱模式的 RC 遠端控制埠支援
- **原因剖析**：先前版本僅在啟用「背景預熱 (Warm-up)」時才會啟動 Rclone RC 遠端控制埠。若硬碟使用「官方平衡 (Default)」模式（例如部分 WebDAV 磁碟機）或關閉 Warm-up，Rclone 掛載行程不會開啟 RC 伺服器，導致點擊「刷新快取」時連線失敗（顯示 `No connection could be made because the target machine actively refused it`）。
- **完整修復**：
  - 現在**所有掛載模式（極速推薦、官方平衡、自訂進階）均會自動分配獨立且專屬的 RC 埠**，以保證隨時可進行手動快取刷新 (`vfs/refresh`)。
  - 「背景預熱 (Warm-up)」開關回歸其本質：僅控制掛載就緒時是否在後台自動預載目錄樹，不再影響 RC 控制通道的建立。

---

### 2. 💡 改善錯誤指引提示
- 若使用者升級軟體後，嘗試對**升級前已掛載的舊磁碟機**執行刷新，系統會給予清晰直覺的提示訊息：
  > 「此磁碟機掛載時未啟用 RC 遠端控制埠。請先將此磁碟『卸載』後重新『掛載』，即可使用刷新快取！」

---

## 🔒 檔案校驗雜湊值 (SHA-256 Checksums)

為確保您下載的安裝檔為官方發布且未受任何第三方竄改，請比對以下 SHA-256 雜湊值：

| 檔案名稱 | SHA-256 雜湊值 |
| :--- | :--- |
| `RcloneDrive_v1.6.4_x64_Setup.exe` | `d80dbbf34206dba595324fdc60477c45ed686bf8fa818142f813966264dfacad` |
| `RcloneDrive_v1.6.4_Portable_x64.exe` | `224b34ee0b67a2bd16f59e48084ac37ea3f45071d6f0fa16b9f89c83ac8ea43a` |
| `RcloneDrive_v1.6.4_x64.msi` | `46ae673b17182646a755444679282218a25c351872e5e5d6f3b9d7e709be4904` |

---

## 🛡️ 首次下載與防毒軟體提示說明

若您在下載或執行時遇到防毒軟體提示「資訊結果不明」或 Windows Defender SmartScreen 提示：
1. **解除提示**：
   - Windows SmartScreen：點選 **「其他資訊」** ➔ **「仍要執行」**。
2. **雜湊比對驗證**：在 PowerShell 執行 `Get-FileHash <檔案路徑> -Algorithm SHA256`，比對輸出與上方 Checksum 一致，即可 100% 確保安全性。
