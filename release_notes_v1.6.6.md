# Rclone Drive & Sync v1.6.6 更新日志

## 🚀 版本亮点概述

本次版本聚焦「中国大陆常用网盘」支持、挂载能力增强与全量简体中文化，并调整了更新渠道与项目来源说明。

---

### 1. 🇨🇳 中国大陆常用网盘支持

- **PikPak**：使用 rclone 原生 `pikpak` 后端，图形化输入账号密码即可直连挂载（需 rclone v1.63 及以上）。
- **坚果云 (Nutstore)**：内置 WebDAV 预设（`https://dav.jianguoyun.com/dav/`），使用「应用密码」直连。
- **123 云盘**：内置官方 WebDAV 预设（VIP / SVIP 权益），使用「应用密码」直连。
- **OpenList / AList 聚合**：通过 WebDAV 接口统一挂载百度网盘、阿里云盘、夸克网盘、115、天翼云盘、迅雷云盘等未内置私有协议的网盘，可同时聚合多个网盘。

### 2. 💽 挂载能力增强

- **远程子路径挂载**：挂载 FTP / SFTP 等后端时可指定服务器上的子目录（如 `/data`），留空则沿用 rclone 默认路径（用户主目录）。
- **远程描述信息**：读取并展示 rclone 配置中的 `description` 字段，多网盘场景下更易区分。
- **PikPak 专属图标映射**：修正相关后端的磁盘图标回退逻辑。

### 3. 🛠️ 添加网盘流程优化

- PikPak / WebDAV 类（坚果云、123 云盘、OpenList）创建时使用 `--non-interactive` 静默提交，避免卡在命令行交互界面。
- 创建失败时自动清理本次产生的**半成品配置**；原本已存在的同名远程不受影响，避免误删。
- 当 rclone 版本不支持所选后端时，给出更明确的中文提示（建议升级 rclone 或改用「原版终端向导」）。

### 4. 🈶 界面语言统一为简体中文

- 全部界面文案、设置项、提示与错误信息由繁体中文改为简体中文。
- 统一大陆常用术语：唯读→只读、预设→默认、档案→文件、程式→程序、资讯→信息、快取→缓存、选单→菜单、磁盘代号→盘符等。
- 同步更新窗口标题、安装器注释、`.env.example`、`rclone_mount_config.json` 注释与 README，避免中英/繁简混用。

### 5. 🔗 更新渠道与项目来源

- 应用内「检查更新 / 自动检查版本」的 GitHub 仓库已切换为 [Alia2006/rclone-drive](https://github.com/Alia2006/rclone-drive)。
- README 与 LICENSE 中注明本项目源自原作者 [@alan0830](https://github.com/alan0830) 的开源项目 [alan0830/rclone-drive](https://github.com/alan0830/rclone-drive)，原始版权归原作者所有。

---

### 6. 🔐 构建与校验

- 继续使用 Tauri v2 + Rust release 构建，安装包与单文件版同步发布。
- 提供 SHA-256 校验值及 `checksums.txt` 清单。

---

## 📦 文件校验哈希值 (SHA-256 Checksums)

| 文件名称 | SHA-256 哈希值 |
| :--- | :--- |
| RcloneDrive_v1.6.6_x64_Setup.exe | （构建后填写） |
| RcloneDrive_v1.6.6_Portable_x64.exe | （构建后填写） |
| RcloneDrive_v1.6.6_x64.msi | （构建后填写） |

---

## 🛡️ 首次下载被杀毒软件误报提示说明

若下载或运行时被杀毒软件提示风险，通常为 Windows Defender SmartScreen 的「未知发布者」提示：
1. **如何处理提示**：
   - Windows SmartScreen：点击 **「更多信息」** ➔ **「仍要运行」**。
2. **哈希值对比验证**：在 PowerShell 运行 `Get-FileHash <文件路径> -Algorithm SHA256`，与上方 Checksum 一致即代表 100% 未被篡改。

---

## 📋 系统要求与使用提示

- **系统**：Windows 10 / 11（64 位）
- **依赖**：[WinFsp](https://winfsp.dev/)（挂载盘符必需）、[Rclone](https://rclone.org/downloads/)（建议 v1.63 及以上，以支持 PikPak 等新后端）
- **升级方式**：直接运行新版安装包即可原地覆盖升级（自动卸载旧挂载并结束旧进程），个人配置与调度任务保存在本地，不会丢失
- **建议**：升级前先在主界面「全部卸载」，避免正在使用的盘符被安装器强制结束进程
