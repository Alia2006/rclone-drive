# Rclone Drive & Sync v1.6.5 更新日志

## 🚀 版本亮点概述

此版本主要更新并升级核心构建工具与前端依赖包，确保模块解析优化与打包兼容性：

---

### 1. ⚡ 核心构建环境升级
- **Vite 升级至 v8.3.5**：提升热重载（HMR）性能与兼容性。
- **Rolldown 打包器升级至 v1.2.15**：增强多平台原生绑定稳定性与打包速度。
- **PostCSS 升级至 v8.5.31** 与 **Nanoid 升级至 v3.3.20**：更新底层依赖，确保安全修复与运行稳定。

---

### 2. 📦 完整重新打包与校验
- 重新使用 Tauri v2 + Rust 1.99.0 构建全新 release 安装包与单文件便携版。
- 内置 SHA-256 完整性哈希值与 checksums.txt 清单。

---

## 🔒 文件校验哈希值 (SHA-256 Checksums)

为确保您下载的安装包为官方发布且未受任何第三方篡改，请比对以下 SHA-256 哈希值：

| 文件名称 | SHA-256 哈希值 |
| :--- | :--- |
| RcloneDrive_v1.6.5_x64_Setup.exe | 7b6adf2c25a54d588d165df6794ad187b612beaed6081d50c470956cb4648fc |
| RcloneDrive_v1.6.5_Portable_x64.exe | 3e7ef62370c5ea4963c4fc9681beabd0c630d1a03e71b37e85ccb04370884427 |
| RcloneDrive_v1.6.5_x64.msi | 15575d40effd13981a206b7604afdc7d9ce8a80b9d8e9614da6c71fc3245571d |

---

## 🛡️ 首次下载与杀毒软件提示说明

若您在下载或运行时遇到杀毒软件提示「信息结果不明」或 Windows Defender SmartScreen 提示：
1. **解除提示**：
   - Windows SmartScreen：点击 **「更多信息」** ➔ **「仍要运行」**。
2. **哈希比对验证**：在 PowerShell 运行 Get-FileHash <文件路径> -Algorithm SHA256，比对输出与上方 Checksum 一致，即可 100% 确保安全性。
