<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";
import {
  HardDrive,
  Cloud,
  FolderOpen,
  Power,
  RefreshCw,
  Settings,
  PlusCircle,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Check,
  X,
  Sliders,
  ShieldCheck,
  Disc3,
  Layers,
  Info,
  ArrowRightLeft,
  CalendarClock,
  Globe,
  Trash2,
  FileCheck,
  Play,
  RotateCw,
  FolderSync,
  Pencil,
  KeyRound,
  DownloadCloud,
  ArrowRight,
  ArrowLeft,
  Equal,
  Folder,
  Search,
  Filter,
  Copy,
  ChevronRight,
  FolderPlus,
  SlidersHorizontal,
  Sun,
  Moon,
  Zap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Terminal,
  HelpCircle,
  Server,
  Database,
  ChevronDown,
  Gauge,
  Flame
} from "lucide-vue-next";

// Theme State (Dark / Light)
const isLightMode = ref(localStorage.getItem("rclone_theme") === "light");

function applyTheme(isLight) {
  if (isLight) {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function toggleTheme() {
  isLightMode.value = !isLightMode.value;
  localStorage.setItem("rclone_theme", isLightMode.value ? "light" : "dark");
  applyTheme(isLightMode.value);
  showToast(isLightMode.value ? "已切换为浅色主题 ☀️" : "已切换为深色主题 🌙", "info");
}

// Active Tab
const activeTab = ref("mounts"); // 'mounts' | 'sync' | 'scheduler' | 'webgui'

// Environment & State
const envStatus = ref({
  rclone_found: false,
  rclone_path: "C:\\rclone\\rclone.exe",
  rclone_version: "",
  winfsp_found: false,
  webgui_running: false,
  webgui_url: "http://127.0.0.1:5572/"
});

const remotes = ref([]);
const availableDrives = ref([]);
const isRefreshing = ref(false);
const showSettings = ref(false);
const showAddRemoteModal = ref(false);
const showEditRemoteModal = ref(false);
const autostartActive = ref(false);
const startMinimizedActive = ref(true);
const customRclonePath = ref(localStorage.getItem("rclone_custom_path") || "C:\\rclone\\rclone.exe");

// Configuration map for remotes (Persisted to localStorage)
const savedRemoteConfigs = JSON.parse(localStorage.getItem("rclone_remote_configs") || "{}");
const remoteConfigs = reactive(savedRemoteConfigs);

function saveRemoteConfigs() {
  localStorage.setItem("rclone_remote_configs", JSON.stringify(remoteConfigs));
}

// Mount Preset & Performance Tuning Options
const expandedAdvancedOpts = reactive({});
const globalMountPreset = ref(localStorage.getItem("rclone_global_mount_preset") || "fast");

function saveGlobalMountPreset(preset) {
  globalMountPreset.value = preset;
  localStorage.setItem("rclone_global_mount_preset", preset);
  showToast(`已更新全局默认挂载策略为: ${preset === 'fast' ? '⚡ 极速推荐' : preset === 'default' ? '⚖️ 官方默认' : '🛠️ 自定义高级'}`, "info");
}

function toggleAdvancedOpts(name) {
  expandedAdvancedOpts[name] = !expandedAdvancedOpts[name];
}

function getDefaultMountOptions(preset = "fast") {
  if (preset === "default") {
    return {
      preset: "default",
      dirCacheTime: "5m",
      pollInterval: "1m",
      attrTimeout: "1s",
      noModtime: false,
      vfsCacheMode: "full",
      vfsCacheMaxSize: "off",
      vfsCacheMaxAge: "1h",
      vfsReadChunkSize: "128M",
      vfsReadChunkSizeLimit: "off",
      drivePacerMinSleep: "100ms",
      drivePacerBurst: 100,
      enableDrivePacer: false,
      warmUp: false,
      extraFlags: ""
    };
  }
  // Fast (默认推荐优化)
  return {
    preset: "fast",
    dirCacheTime: "72h",
    pollInterval: "1m",
    attrTimeout: "10m",
    noModtime: true,
    vfsCacheMode: "full",
    vfsCacheMaxSize: "50G",
    vfsCacheMaxAge: "24h",
    vfsReadChunkSize: "64M",
    vfsReadChunkSizeLimit: "1G",
    drivePacerMinSleep: "10ms",
    drivePacerBurst: 200,
    enableDrivePacer: true,
    warmUp: true,
    extraFlags: ""
  };
}

function ensureRemoteMountOptions(remoteName) {
  if (!remoteConfigs[remoteName]) return;
  if (!remoteConfigs[remoteName].mountPreset) {
    remoteConfigs[remoteName].mountPreset = globalMountPreset.value || "fast";
  }
  if (!remoteConfigs[remoteName].mountOptions) {
    remoteConfigs[remoteName].mountOptions = getDefaultMountOptions(remoteConfigs[remoteName].mountPreset);
  }
}

function applyPresetToRemote(remoteName, preset) {
  if (!remoteConfigs[remoteName]) return;
  remoteConfigs[remoteName].mountPreset = preset;
  if (preset !== "custom") {
    remoteConfigs[remoteName].mountOptions = getDefaultMountOptions(preset);
    if (remoteConfigs[remoteName].mountOptions.vfsCacheMode) {
      remoteConfigs[remoteName].cacheMode = remoteConfigs[remoteName].mountOptions.vfsCacheMode;
    }
  } else {
    if (!remoteConfigs[remoteName].mountOptions) {
      remoteConfigs[remoteName].mountOptions = getDefaultMountOptions("fast");
    }
    remoteConfigs[remoteName].mountOptions.preset = "custom";
  }
  saveRemoteConfigs();
}

function onCustomMountOptionChange(remoteName) {
  if (!remoteConfigs[remoteName]) return;
  remoteConfigs[remoteName].mountPreset = "custom";
  if (remoteConfigs[remoteName].mountOptions?.vfsCacheMode) {
    remoteConfigs[remoteName].cacheMode = remoteConfigs[remoteName].mountOptions.vfsCacheMode;
  }
  saveRemoteConfigs();
}

const loadingRemotes = reactive(new Set());
const refreshingCacheRemotes = reactive(new Set());
const autoMountList = ref(JSON.parse(localStorage.getItem("rclone_auto_mount_list") || "[]"));

// Supported Providers & S3 Settings
const supportedProviders = ref([]);

const S3_PROVIDERS = [
  { value: "AWS", label: "Amazon Web Services (AWS S3 官方)", defaultRegion: "us-east-1", defaultEndpoint: "", hint: "官方 S3 端点可留空" },
  { value: "Cloudflare", label: "Cloudflare R2", defaultRegion: "auto", defaultEndpoint: "", hint: "例如 https://<ACCOUNT_ID>.r2.cloudflarestorage.com" },
  { value: "Minio", label: "MinIO 自建对象存储", defaultRegion: "", defaultEndpoint: "http://127.0.0.1:9000", forcePathStyle: true, hint: "一般需启用路径样式 (Force Path Style)" },
  { value: "Wasabi", label: "Wasabi Cloud Storage", defaultRegion: "us-east-1", defaultEndpoint: "", hint: "支持 Wasabi 各区域" },
  { value: "Backblaze", label: "Backblaze B2 (兼容 S3 API)", defaultRegion: "us-west-004", defaultEndpoint: "s3.us-west-004.backblazeb2.com", hint: "使用 Backblaze B2 的 S3 兼容端点" },
  { value: "Alibaba", label: "阿里云 OSS (S3 兼容)", defaultRegion: "oss-cn-hangzhou", defaultEndpoint: "oss-cn-hangzhou.aliyuncs.com", hint: "使用阿里云 OSS 端点" },
  { value: "TencentCOS", label: "腾讯云 COS (S3 兼容)", defaultRegion: "ap-guangzhou", defaultEndpoint: "cos.ap-guangzhou.myqcloud.com", hint: "使用腾讯云 COS 端点" },
  { value: "DigitalOcean", label: "DigitalOcean Spaces", defaultRegion: "nyc3", defaultEndpoint: "nyc3.digitaloceanspaces.com", hint: "例如 nyc3.digitaloceanspaces.com" },
  { value: "Ceph", label: "Ceph Object Storage", defaultRegion: "", defaultEndpoint: "", hint: "Ceph 自建对象存储" },
  { value: "Other", label: "其他自定义兼容 S3 (兼容 MinIO/S3 协议)", defaultRegion: "", defaultEndpoint: "", hint: "兼容 AWS S3 规范的各类存储" }
];

const STORAGE_CATEGORIES = [
  {
    category: "常用个人与企业云端",
    items: [
      { type: "drive", name: "Google Drive (个人 / 企业云端硬盘)", auth: "oauth", hint: "浏览器 OAuth 登录" },
      { type: "onedrive", name: "Microsoft OneDrive (个人 / 商务版)", auth: "oauth", hint: "浏览器 OAuth 登录" },
      { type: "dropbox", name: "Dropbox", auth: "oauth", hint: "浏览器 OAuth 登录" },
      { type: "box", name: "Box", auth: "oauth", hint: "浏览器 OAuth 登录" },
      { type: "pcloud", name: "pCloud", auth: "oauth", hint: "浏览器 OAuth 登录" },
      { type: "mega", name: "Mega", auth: "credentials", hint: "账号密码登录" },
      { type: "protondrive", name: "Proton Drive", auth: "credentials", hint: "账号密码登录" },
      { type: "yandex", name: "Yandex Disk", auth: "oauth", hint: "浏览器 OAuth 登录" },
      { type: "koofr", name: "Koofr", auth: "credentials", hint: "账号密码登录" }
    ]
  },
  {
    category: "对象存储 (S3 & Cloud Storage)",
    items: [
      { type: "s3", name: "Amazon S3 或兼容对象存储 (Cloudflare R2, MinIO, Wasabi...)", auth: "s3", hint: "Access Key / Secret Key 密钥认证 (免浏览器)" },
      { type: "b2", name: "Backblaze B2 (原生 API)", auth: "b2", hint: "Account ID / Application Key" },
      { type: "gcs", name: "Google Cloud Storage (GCS)", auth: "oauth", hint: "Google Cloud 对象存储" },
      { type: "azureblob", name: "Microsoft Azure Blob 存储", auth: "azure", hint: "Storage Account / Key" }
    ]
  },
  {
    category: "标准传输协议与网上邻居",
    items: [
      { type: "webdav", name: "WebDAV (Nextcloud, ownCloud, Synology, 坚果云...)", auth: "webdav", hint: "URL 与账号密码" },
      { type: "smb", name: "SMB / CIFS (Windows 网上邻居 / Samba)", auth: "smb", hint: "Host, 账号密码与 Domain" },
      { type: "sftp", name: "SFTP / SSH 服务器", auth: "sftp", hint: "Host, Port 与账号密码/私钥" },
      { type: "ftp", name: "FTP 服务器", auth: "ftp", hint: "Host, Port 与账号密码" }
    ]
  },
  {
    category: "高级虚拟与本机存储",
    items: [
      { type: "local", name: "本机路径 / 外置硬盘 (Local)", auth: "local", hint: "本机文件夹直接挂载为虚拟磁盘" },
      { type: "crypt", name: "加密硬盘 (Crypt - 加密现有云端)", auth: "crypt", hint: "端对端加密透明保险箱" },
      { type: "union", name: "联合磁盘 (Union - 合并多个硬盘空间)", auth: "union", hint: "多个远程聚合成单一盘符" }
    ]
  }
];

function isOAuthType(type = "") {
  const t = (type || "").toLowerCase();
  return ["drive", "onedrive", "dropbox", "box", "pcloud", "yandex"].includes(t);
}

// Add Remote Modal State
const newRemoteForm = reactive({
  name: "",
  type: "drive",
  url: "",
  user: "",
  pass: "",
  host: "",
  port: "21",
  domain: "",
  clientId: "",
  clientSecret: "",
  // S3 Specific
  s3Provider: "AWS",
  s3AccessKey: "",
  s3SecretKey: "",
  s3Region: "us-east-1",
  s3Endpoint: "",
  s3ForcePathStyle: false,
  s3EnvAuth: false,
  showSecretKey: false,
  // Other storage
  account: "",
  key: "",
  searchProvider: "",
  isCreating: false
});

// Edit Remote Modal State
const editRemoteForm = reactive({
  name: "",
  newName: "",
  type: "",
  url: "",
  user: "",
  pass: "",
  host: "",
  port: "21",
  domain: "",
  clientId: "",
  clientSecret: "",
  // S3 Specific
  s3Provider: "AWS",
  s3AccessKey: "",
  s3SecretKey: "",
  s3Region: "",
  s3Endpoint: "",
  s3ForcePathStyle: false,
  s3EnvAuth: false,
  showSecretKey: false,
  // Other storage
  account: "",
  key: "",
  isSaving: false,
  isReconnecting: false
});

function onS3ProviderSelect(form, provValue) {
  form.s3Provider = provValue;
  const found = S3_PROVIDERS.find((p) => p.value === provValue);
  if (found) {
    if (found.defaultRegion && !form.s3Region) {
      form.s3Region = found.defaultRegion;
    }
    if (found.defaultEndpoint && !form.s3Endpoint) {
      form.s3Endpoint = found.defaultEndpoint;
    }
    if (found.forcePathStyle !== undefined) {
      form.s3ForcePathStyle = found.forcePathStyle;
    }
  }
}

async function handleOpenRcloneTerminal() {
  try {
    await invoke("open_rclone_config_terminal", {
      rclonePath: customRclonePath.value.trim() || null
    });
    showToast("已在独立窗口启动 Rclone 原版交互设置向导！完成设置后请回此处点击刷新。", "info");
  } catch (err) {
    showToast(`启动原版设置终端失败: ${err}`, "error");
  }
}

const filteredStorageCategories = computed(() => {
  const kw = (newRemoteForm.searchProvider || "").trim().toLowerCase();
  if (!kw) return STORAGE_CATEGORIES;
  return STORAGE_CATEGORIES.map((cat) => {
    return {
      category: cat.category,
      items: cat.items.filter(
        (it) =>
          it.name.toLowerCase().includes(kw) ||
          it.type.toLowerCase().includes(kw) ||
          (it.hint && it.hint.toLowerCase().includes(kw))
      )
    };
  }).filter((cat) => cat.items.length > 0);
});

const allOtherRcloneProviders = computed(() => {
  const popularTypes = new Set();
  STORAGE_CATEGORIES.forEach((c) => c.items.forEach((i) => popularTypes.add(i.type)));
  const kw = (newRemoteForm.searchProvider || "").trim().toLowerCase();
  if (!supportedProviders.value || supportedProviders.value.length === 0) return [];
  return supportedProviders.value
    .filter((p) => !popularTypes.has(p.Prefix))
    .filter((p) => {
      if (!kw) return true;
      const desc = p.Description || p.Name || "";
      return p.Prefix.toLowerCase().includes(kw) || desc.toLowerCase().includes(kw);
    });
});

// Sync & Compare State (RcloneView Plus)
const syncForm = reactive({
  source: "",
  dest: "", // 主要目的路径 (兼容既有调度与比对)
  extraDests: [], // 额外目的路径清单: [ { id: string, path: string } ]
  action: "copy", // 默认使用 copy (增量备份，更安全)
  excludeFilter: "",
  searchKeyword: "",
  filterModes: {
    source_only: true, // ➡️ 来源待备份
    dest_only: true,   // ⬅️ 目标端多出
    different: true,   // ≠ 差异
    equal: false,      // ＝ 相同
    error: true        // ❗ 异常
  },
  selectedItems: new Set(),
  autoAddToScheduler: false, // 是否在设置/同步完成后自动加入调度
  isChecking: false,
  isRunning: false,
  isCopyingSelected: false,
  diffResult: null,
  taskLog: ""
});

// Cloud Directory Browser Modal State
const showCloudBrowseModal = ref(false);
const cloudBrowseTarget = ref("source"); // 'source' | 'dest'
const cloudBrowseRemote = ref("");
const cloudBrowseCurrentSubpath = ref("");
const cloudBrowseDirs = ref([]);
const isLoadingCloudDirs = ref(false);

// Scheduler State
const scheduledTasks = ref(JSON.parse(localStorage.getItem("rclone_scheduled_tasks") || "[]"));
const showAddTaskModal = ref(false);
const showEditTaskModal = ref(false);
const newTask = reactive({
  name: "",
  source: "",
  dest: "",
  action: "copy",
  excludeFilter: "",
  intervalMinutes: 60,
  enabled: true
});
const editTaskForm = reactive({
  id: "",
  name: "",
  source: "",
  dest: "",
  action: "copy",
  excludeFilter: "",
  intervalMinutes: 60,
  enabled: true
});

let schedulerTimer = null;

// GitHub Auto-Update State & Settings
const CURRENT_VERSION = "1.6.5";
const GITHUB_REPO = "alan0830/rclone-drive";

const savedUpdateSettings = JSON.parse(localStorage.getItem("rclone_update_settings") || "{}");
const updateSettings = reactive({
  enabled: savedUpdateSettings.enabled !== false, // 默认打开自动检查
  intervalDays: Number(savedUpdateSettings.intervalDays) || 7, // 默认一周 (7 天)
  lastCheckTs: Number(savedUpdateSettings.lastCheckTs) || 0,
  lastCheckTimeStr: savedUpdateSettings.lastCheckTimeStr || "从未检查"
});

function saveUpdateSettings() {
  localStorage.setItem("rclone_update_settings", JSON.stringify(updateSettings));
}

function toggleUpdateEnabled() {
  updateSettings.enabled = !updateSettings.enabled;
  saveUpdateSettings();
  showToast(updateSettings.enabled ? "已启用自动检查版本更新 🔔" : "已关闭自动检查更新 🔕", "info");
}

const showUpdateModal = ref(false);
const isCheckingUpdate = ref(false);
const isDownloadingUpdate = ref(false);
const updateInfo = reactive({
  latestVersion: "",
  currentVersion: CURRENT_VERSION,
  releaseTitle: "",
  releaseNotes: "",
  publishedAt: "",
  htmlUrl: "",
  downloadUrl: "",
  assetName: ""
});

function compareSemver(v1, v2) {
  const clean1 = (v1 || "").replace(/^v/i, "").trim().split(".").map((n) => parseInt(n, 10) || 0);
  const clean2 = (v2 || "").replace(/^v/i, "").trim().split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(clean1.length, clean2.length);
  for (let i = 0; i < len; i++) {
    const num1 = clean1[i] || 0;
    const num2 = clean2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

async function checkForUpdates(manual = false) {
  if (!manual) {
    if (!updateSettings.enabled) return;
    const intervalMs = (updateSettings.intervalDays || 7) * 24 * 60 * 60 * 1000;
    if (Date.now() - (updateSettings.lastCheckTs || 0) < intervalMs) {
      return; // 检查间隔未到，跳过
    }
  }

  isCheckingUpdate.value = true;
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json" }
    });
    if (!res.ok) {
      throw new Error(`GitHub API 响应错误 (${res.status} ${res.statusText})`);
    }
    const data = await res.json();
    const latestTag = data.tag_name || "";

    updateSettings.lastCheckTs = Date.now();
    updateSettings.lastCheckTimeStr = new Date().toLocaleString();
    saveUpdateSettings();

    if (compareSemver(latestTag, CURRENT_VERSION) > 0) {
      updateInfo.latestVersion = latestTag.replace(/^v/i, "");
      updateInfo.currentVersion = CURRENT_VERSION;
      updateInfo.releaseTitle = data.name || latestTag;
      updateInfo.releaseNotes = data.body || "本次更新包含功能改进与问题修复。";
      updateInfo.publishedAt = data.published_at ? new Date(data.published_at).toLocaleDateString() : "";
      updateInfo.htmlUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;

      let assetUrl = "";
      let assetName = "";
      if (Array.isArray(data.assets)) {
        const exeAsset = data.assets.find(
          (a) => a.name.toLowerCase().endsWith(".exe") || a.name.toLowerCase().endsWith(".msi")
        );
        if (exeAsset) {
          assetUrl = exeAsset.browser_download_url;
          assetName = exeAsset.name;
        }
      }
      updateInfo.downloadUrl = assetUrl || updateInfo.htmlUrl;
      updateInfo.assetName = assetName;

      showUpdateModal.value = true;
    } else {
      if (manual) {
        showToast(`目前已是最新版本 (v${CURRENT_VERSION})！`, "success");
      }
    }
  } catch (err) {
    if (manual) {
      showToast(`检查更新失败: ${err.message || err}`, "error");
    }
  } finally {
    isCheckingUpdate.value = false;
  }
}

async function executeUpdate() {
  if (!updateInfo.downloadUrl || (!updateInfo.downloadUrl.endsWith(".exe") && !updateInfo.downloadUrl.endsWith(".msi"))) {
    await openUrl(updateInfo.htmlUrl);
    showUpdateModal.value = false;
    return;
  }

  isDownloadingUpdate.value = true;
  showToast("正在安全卸载所有已挂载磁盘，并下载安装更新...", "info");
  try {
    // 1. 先安全卸载所有已挂载的磁盘
    try {
      await invoke("unmount_all");
      await refreshAll();
    } catch (_) {}

    const msg = await invoke("download_and_install_update", {
      downloadUrl: updateInfo.downloadUrl
    });
    showToast(msg || "更新安装程序已成功启动，主程序即将退出...", "success");
    showUpdateModal.value = false;
  } catch (err) {
    showToast(`自动启动更新失败: ${err}，已为您在浏览器打开下载页面`, "error");
    await openUrl(updateInfo.htmlUrl);
    showUpdateModal.value = false;
  } finally {
    isDownloadingUpdate.value = false;
  }
}

// Toast notification
const toast = ref({ show: false, message: "", type: "info" });
let toastTimer = null;
function showToast(message, type = "info") {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = { show: true, message, type };
  toastTimer = setTimeout(() => {
    toast.value.show = false;
  }, 4500);
}

// Open External URL
async function openUrl(url) {
  try {
    await invoke("open_browser_url", { url });
  } catch (err) {
    showToast(`打开网页失败: ${err}`, "error");
  }
}

// Provider details helper
function getProviderDetails(type = "") {
  const t = (type || "").toLowerCase();
  if (t.includes("onedrive")) return { name: "Microsoft OneDrive", color: "#0078D4", bg: "rgba(0, 120, 212, 0.15)" };
  if (t.includes("drive") && !t.includes("onedrive") && !t.includes("proton") && !t.includes("huawei")) return { name: "Google Drive", color: "#4285F4", bg: "rgba(66, 133, 244, 0.15)" };
  if (t.includes("photo")) return { name: "Google Photos", color: "#EA4335", bg: "rgba(234, 67, 53, 0.15)" };
  if (t.includes("dropbox")) return { name: "Dropbox", color: "#0061FF", bg: "rgba(0, 97, 255, 0.15)" };
  if (t.includes("s3")) return { name: "Amazon S3 / 对象存储", color: "#FF9900", bg: "rgba(255, 153, 0, 0.15)" };
  if (t.includes("b2")) return { name: "Backblaze B2", color: "#E01F26", bg: "rgba(224, 31, 38, 0.15)" };
  if (t.includes("azureblob") || t.includes("azurefiles")) return { name: "Azure 存储", color: "#0089D6", bg: "rgba(0, 137, 214, 0.15)" };
  if (t.includes("gcs") || t.includes("googlecloudstorage")) return { name: "Google Cloud Storage", color: "#4285F4", bg: "rgba(66, 133, 244, 0.15)" };
  if (t.includes("box")) return { name: "Box", color: "#0061D5", bg: "rgba(0, 97, 213, 0.15)" };
  if (t.includes("pcloud")) return { name: "pCloud", color: "#13B5EA", bg: "rgba(19, 181, 234, 0.15)" };
  if (t.includes("mega")) return { name: "Mega", color: "#D90007", bg: "rgba(217, 0, 7, 0.15)" };
  if (t.includes("proton")) return { name: "Proton Drive", color: "#6D4AFF", bg: "rgba(109, 74, 255, 0.15)" };
  if (t.includes("webdav")) return { name: "WebDAV", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)" };
  if (t.includes("smb")) return { name: "SMB 网上邻居", color: "#3B82F6", bg: "rgba(59, 130, 246, 0.15)" };
  if (t.includes("sftp")) return { name: "SFTP / SSH", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.15)" };
  if (t.includes("ftp")) return { name: "FTP 服务器", color: "#A855F7", bg: "rgba(168, 85, 247, 0.15)" };
  if (t.includes("local")) return { name: "本机磁盘 (Local)", color: "#14B8A6", bg: "rgba(20, 184, 166, 0.15)" };
  if (t.includes("crypt")) return { name: "加密硬盘 (Crypt)", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.15)" };
  if (t.includes("union")) return { name: "联合磁盘 (Union)", color: "#EC4899", bg: "rgba(236, 72, 153, 0.15)" };
  return { name: type || "云存储", color: "#38BDF8", bg: "rgba(56, 189, 248, 0.15)" };
}

// Autostart & Start Minimized
async function checkAutostart() {
  try {
    autostartActive.value = await isEnabled();
    const settings = await invoke("get_app_settings");
    if (settings && typeof settings.start_minimized_to_tray === "boolean") {
      startMinimizedActive.value = settings.start_minimized_to_tray;
    }
  } catch (err) {
    console.error("检查开机自启与偏好失败:", err);
  }
}

async function toggleAutostart() {
  try {
    if (autostartActive.value) {
      await disable();
      autostartActive.value = false;
      showToast("已关闭开机自动启动", "info");
    } else {
      await enable();
      autostartActive.value = true;
      showToast("已打开开机自动启动！", "success");
    }
  } catch (err) {
    showToast(`设置开机自启失败: ${err}`, "error");
  }
}

async function toggleStartMinimized() {
  try {
    startMinimizedActive.value = !startMinimizedActive.value;
    await invoke("save_app_settings", {
      settings: {
        start_minimized_to_tray: startMinimizedActive.value
      }
    });
    showToast(
      startMinimizedActive.value
        ? "已启用「开机启动后缩小至系统托盘」"
        : "已禁用「开机启动后缩小至系统托盘」（开机自启时将直接显示主窗口）",
      "success"
    );
  } catch (err) {
    showToast(`设置缩小至系统托盘失败: ${err}`, "error");
  }
}

// ==========================================
// Mounts List Sorting & Reordering State
// ==========================================
const mountSortBy = ref(localStorage.getItem("rclone_mount_sort_by") || "default");
const customRemoteOrder = ref(JSON.parse(localStorage.getItem("rclone_mount_custom_order") || "[]"));

function saveSortSettings() {
  localStorage.setItem("rclone_mount_sort_by", mountSortBy.value);
  localStorage.setItem("rclone_mount_custom_order", JSON.stringify(customRemoteOrder.value));
}

function onSortChange() {
  if (mountSortBy.value === "custom" && (!customRemoteOrder.value || customRemoteOrder.value.length === 0)) {
    customRemoteOrder.value = remotes.value.map((r) => r.name);
  }
  saveSortSettings();
}

function moveRemote(remoteName, direction) {
  // If not already in custom mode, initialize custom order from current sorted list
  if (mountSortBy.value !== "custom") {
    customRemoteOrder.value = sortedRemotes.value.map((r) => r.name);
    mountSortBy.value = "custom";
    showToast("已自动切换至「自定义顺序」模式", "info");
  } else if (!customRemoteOrder.value || customRemoteOrder.value.length === 0) {
    customRemoteOrder.value = remotes.value.map((r) => r.name);
  }

  // Ensure all current remotes exist in customRemoteOrder
  for (const r of remotes.value) {
    if (!customRemoteOrder.value.includes(r.name)) {
      customRemoteOrder.value.push(r.name);
    }
  }

  const currIdx = customRemoteOrder.value.indexOf(remoteName);
  const targetIdx = currIdx + direction;
  if (currIdx !== -1 && targetIdx >= 0 && targetIdx < customRemoteOrder.value.length) {
    const item = customRemoteOrder.value.splice(currIdx, 1)[0];
    customRemoteOrder.value.splice(targetIdx, 0, item);
    saveSortSettings();
  }
}

const sortedRemotes = computed(() => {
  const list = [...remotes.value];
  const sortBy = mountSortBy.value;

  if (sortBy === "name-asc") {
    return list.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" }));
  } else if (sortBy === "name-desc") {
    return list.sort((a, b) => (b.name || "").localeCompare(a.name || "", undefined, { numeric: true, sensitivity: "base" }));
  } else if (sortBy === "drive-asc") {
    return list.sort((a, b) => {
      const da = (a.is_mounted ? a.mounted_drive : remoteConfigs[a.name]?.driveLetter) || "Z:";
      const db = (b.is_mounted ? b.mounted_drive : remoteConfigs[b.name]?.driveLetter) || "Z:";
      return da.localeCompare(db) || (a.name || "").localeCompare(b.name || "");
    });
  } else if (sortBy === "drive-desc") {
    return list.sort((a, b) => {
      const da = (a.is_mounted ? a.mounted_drive : remoteConfigs[a.name]?.driveLetter) || "A:";
      const db = (b.is_mounted ? b.mounted_drive : remoteConfigs[b.name]?.driveLetter) || "A:";
      return db.localeCompare(da) || (a.name || "").localeCompare(b.name || "");
    });
  } else if (sortBy === "mounted-first") {
    return list.sort((a, b) => {
      const diff = (b.is_mounted ? 1 : 0) - (a.is_mounted ? 1 : 0);
      return diff !== 0 ? diff : (a.name || "").localeCompare(b.name || "");
    });
  } else if (sortBy === "unmounted-first") {
    return list.sort((a, b) => {
      const diff = (a.is_mounted ? 1 : 0) - (b.is_mounted ? 1 : 0);
      return diff !== 0 ? diff : (a.name || "").localeCompare(b.name || "");
    });
  } else if (sortBy === "type") {
    return list.sort((a, b) => {
      const diff = (a.remote_type || "").localeCompare(b.remote_type || "");
      return diff !== 0 ? diff : (a.name || "").localeCompare(b.name || "");
    });
  } else if (sortBy === "custom") {
    if (!customRemoteOrder.value || customRemoteOrder.value.length === 0) return list;
    return list.sort((a, b) => {
      let idxA = customRemoteOrder.value.indexOf(a.name);
      let idxB = customRemoteOrder.value.indexOf(b.name);
      if (idxA === -1) idxA = 9999;
      if (idxB === -1) idxB = 9999;
      return idxA - idxB;
    });
  }
  return list;
});

// Refresh status and remotes
async function refreshAll(isInitial = false) {
  isRefreshing.value = true;
  try {
    const env = await invoke("check_environment", {
      rclonePath: customRclonePath.value.trim() || null
    });
    envStatus.value = env;

    const drives = await invoke("get_available_drives");
    availableDrives.value = drives;

    const remoteList = await invoke("get_remotes", {
      rclonePath: customRclonePath.value.trim() || null
    });
    remotes.value = remoteList;

    try {
      await invoke("apply_mounted_drive_icons", { remotes: remoteList });
    } catch (e) {
      console.warn("应用磁盘图标警告:", e);
    }

    let driveIndex = 0;
    remoteList.forEach((r) => {
      if (!remoteConfigs[r.name]) {
        // 全新远程，尚未设置过盘符，避开已被其他远程选择的盘符
        const usedLetters = Object.values(remoteConfigs)
          .map((c) => c?.driveLetter)
          .filter(Boolean);
        const assigned =
          availableDrives.value.find((d) => !usedLetters.includes(d)) ||
          availableDrives.value[driveIndex] ||
          "Z:";
        driveIndex++;

        const defPreset = globalMountPreset.value || "fast";
        remoteConfigs[r.name] = {
          driveLetter: r.mounted_drive || assigned,
          volname: r.name,
          cacheMode: "full",
          readOnly: false,
          autoMount: autoMountList.value.includes(r.name),
          mountPreset: defPreset,
          mountOptions: getDefaultMountOptions(defPreset)
        };
      } else {
        // 已有保存的用户自定义设置，绝对保留用户的 driveLetter！
        if (r.is_mounted && r.mounted_drive) {
          remoteConfigs[r.name].driveLetter = r.mounted_drive;
        }
        remoteConfigs[r.name].autoMount = autoMountList.value.includes(r.name);
        ensureRemoteMountOptions(r.name);
      }
    });
    saveRemoteConfigs();

    if (isInitial && autoMountList.value.length > 0) {
      for (const r of sortedRemotes.value) {
        if (!r.is_mounted && autoMountList.value.includes(r.name)) {
          mountDrive(r.name, false);
        }
      }
    }
  } catch (err) {
    showToast(`加载失败: ${err}`, "error");
  } finally {
    isRefreshing.value = false;
  }
}

// Mount Remote (Network Mode exclusively)
async function mountDrive(remoteName, notify = true) {
  if (!envStatus.value.winfsp_found) {
    showToast("挂载需要 WinFsp，请先点击上方按钮安装 WinFsp！", "error");
    return;
  }
  if (!envStatus.value.rclone_found) {
    showToast("找不到 rclone.exe，请先下载安装！", "error");
    return;
  }

  ensureRemoteMountOptions(remoteName);
  const conf = remoteConfigs[remoteName];
  if (!conf || !conf.driveLetter) {
    showToast("请先选择盘符！", "error");
    return;
  }

  loadingRemotes.add(remoteName);
  try {
    const targetRemote = remotes.value.find((r) => r.name === remoteName);
    const remoteType = targetRemote ? targetRemote.remote_type : null;

    const currentPreset = conf.mountPreset || "fast";
    const baseOpts = conf.mountOptions || getDefaultMountOptions(currentPreset);
    const activeOpts = {
      ...baseOpts,
      preset: currentPreset,
      vfsCacheMode: conf.cacheMode || baseOpts.vfsCacheMode || "full"
    };

    await invoke("mount_remote", {
      rclonePath: customRclonePath.value.trim() || null,
      remote: remoteName,
      driveLetter: conf.driveLetter,
      volname: conf.volname || remoteName,
      cacheMode: conf.cacheMode || "full",
      readOnly: conf.readOnly || false,
      remoteType: remoteType,
      mountOptions: activeOpts
    });

    if (notify) {
      showToast(`已成功挂载 ${remoteName} 至磁盘 ${conf.driveLetter}`, "success");
    }
    await refreshAll();
  } catch (err) {
    showToast(`挂载失败: ${err}`, "error");
  } finally {
    loadingRemotes.delete(remoteName);
  }
}

// Unmount Remote
async function unmountDrive(remoteName) {
  loadingRemotes.add(remoteName);
  try {
    await invoke("unmount_remote", { remote: remoteName });
    showToast(`已卸载 ${remoteName}`, "info");
    await refreshAll();
  } catch (err) {
    showToast(`卸载失败: ${err}`, "error");
  } finally {
    loadingRemotes.delete(remoteName);
  }
}

// Open in File Explorer
async function openExplorer(driveLetter) {
  try {
    await invoke("open_in_explorer", { driveLetter });
  } catch (err) {
    showToast(`无法打开资源管理器: ${err}`, "error");
  }
}

// 强制刷新 VFS 目录缓存（解决新数据不更新问题）
async function vfsRefreshCache(remoteName) {
  if (refreshingCacheRemotes.has(remoteName)) return;
  refreshingCacheRemotes.add(remoteName);
  try {
    const msg = await invoke("vfs_refresh_cache", {
      rclonePath: customRclonePath.value.trim() || null,
      remote: remoteName
    });
    showToast(`✅ ${msg}`, "success");
  } catch (err) {
    showToast(`刷新缓存失败: ${err}`, "error");
  } finally {
    refreshingCacheRemotes.delete(remoteName);
  }
}

// Mount All (mounts unmounted drives in current sorted order)
async function mountAll() {
  const unmounted = sortedRemotes.value.filter((r) => !r.is_mounted);
  if (unmounted.length === 0) {
    showToast("所有云端硬盘都已处于挂载状态", "info");
    return;
  }
  for (const r of unmounted) {
    await mountDrive(r.name, false);
  }
  showToast("已执行挂载全部操作", "success");
  await refreshAll();
}

// Unmount All
async function unmountAll() {
  try {
    const count = await invoke("unmount_all");
    showToast(`已成功卸载 ${count} 个云端硬盘`, "info");
    await refreshAll();
  } catch (err) {
    showToast(`卸载全部失败: ${err}`, "error");
  }
}

// GUI Add Remote
async function submitAddRemote() {
  const nameTrimmed = (newRemoteForm.name || "").trim();
  if (!nameTrimmed) {
    showToast("请输入云端硬盘名称！", "error");
    return;
  }
  if (/[\\/:*?"<>|\[\]]/.test(nameTrimmed)) {
    showToast("云端硬盘名称不可包含特殊字符 (: / \\ [ ] * ? < > | \")", "error");
    return;
  }

  newRemoteForm.isCreating = true;
  const params = {};

  if (isOAuthType(newRemoteForm.type)) {
    if (newRemoteForm.clientId.trim()) params.client_id = newRemoteForm.clientId.trim();
    if (newRemoteForm.clientSecret.trim()) params.client_secret = newRemoteForm.clientSecret.trim();
  } else if (newRemoteForm.type === "s3") {
    params.provider = newRemoteForm.s3Provider || "AWS";
    if (newRemoteForm.s3AccessKey.trim()) params.access_key_id = newRemoteForm.s3AccessKey.trim();
    if (newRemoteForm.s3SecretKey.trim()) params.secret_access_key = newRemoteForm.s3SecretKey.trim();
    if (newRemoteForm.s3Region.trim()) params.region = newRemoteForm.s3Region.trim();
    if (newRemoteForm.s3Endpoint.trim()) params.endpoint = newRemoteForm.s3Endpoint.trim();
    if (newRemoteForm.s3ForcePathStyle) params.force_path_style = "true";
    if (newRemoteForm.s3EnvAuth) params.env_auth = "true";
  } else if (newRemoteForm.type === "webdav") {
    params.url = newRemoteForm.url;
    params.vendor = "other";
    params.user = newRemoteForm.user;
    params.pass = newRemoteForm.pass;
  } else if (newRemoteForm.type === "smb") {
    params.host = newRemoteForm.host;
    params.user = newRemoteForm.user;
    params.pass = newRemoteForm.pass;
    if (newRemoteForm.port) params.port = newRemoteForm.port;
    if (newRemoteForm.domain) params.domain = newRemoteForm.domain;
  } else if (newRemoteForm.type === "ftp") {
    params.host = newRemoteForm.host;
    params.port = newRemoteForm.port || "21";
    params.user = newRemoteForm.user;
    params.pass = newRemoteForm.pass;
  } else if (newRemoteForm.type === "sftp") {
    params.host = newRemoteForm.host;
    params.port = newRemoteForm.port || "22";
    params.user = newRemoteForm.user;
    params.pass = newRemoteForm.pass;
  } else if (newRemoteForm.type === "b2") {
    if (newRemoteForm.account) params.account = newRemoteForm.account.trim();
    if (newRemoteForm.key) params.key = newRemoteForm.key.trim();
  } else if (newRemoteForm.type === "azureblob") {
    if (newRemoteForm.account) params.account = newRemoteForm.account.trim();
    if (newRemoteForm.key) params.key = newRemoteForm.key.trim();
  } else if (newRemoteForm.type === "mega") {
    params.user = newRemoteForm.user;
    params.pass = newRemoteForm.pass;
  } else if (newRemoteForm.type === "protondrive") {
    params.username = newRemoteForm.user;
    params.password = newRemoteForm.pass;
  }

  try {
    const msg = await invoke("create_remote_gui", {
      rclonePath: customRclonePath.value.trim() || null,
      name: nameTrimmed,
      remoteType: newRemoteForm.type,
      params
    });

    showToast(msg || "远程创建成功！", "success");
    showAddRemoteModal.value = false;
    newRemoteForm.name = "";
    newRemoteForm.url = "";
    newRemoteForm.user = "";
    newRemoteForm.pass = "";
    newRemoteForm.host = "";
    newRemoteForm.clientId = "";
    newRemoteForm.clientSecret = "";
    newRemoteForm.s3AccessKey = "";
    newRemoteForm.s3SecretKey = "";
    newRemoteForm.s3Endpoint = "";
    newRemoteForm.account = "";
    newRemoteForm.key = "";
    newRemoteForm.domain = "";
    await refreshAll();
  } catch (err) {
    showToast(`创建失败: ${err}`, "error");
  } finally {
    newRemoteForm.isCreating = false;
  }
}

// Open Edit Remote Modal
async function openEditModal(remote) {
  editRemoteForm.name = remote.name;
  editRemoteForm.newName = remote.name;
  editRemoteForm.type = remote.remote_type;
  editRemoteForm.url = "";
  editRemoteForm.user = "";
  editRemoteForm.pass = "";
  editRemoteForm.host = "";
  editRemoteForm.port = "21";
  editRemoteForm.domain = "";
  editRemoteForm.clientId = "";
  editRemoteForm.clientSecret = "";
  // S3
  editRemoteForm.s3Provider = "AWS";
  editRemoteForm.s3AccessKey = "";
  editRemoteForm.s3SecretKey = "";
  editRemoteForm.s3Region = "";
  editRemoteForm.s3Endpoint = "";
  editRemoteForm.s3ForcePathStyle = false;
  editRemoteForm.s3EnvAuth = false;
  editRemoteForm.showSecretKey = false;
  // Others
  editRemoteForm.account = "";
  editRemoteForm.key = "";

  try {
    const details = await invoke("get_remote_detail", {
      rclonePath: customRclonePath.value.trim() || null,
      name: remote.name
    });
    if (details.url) editRemoteForm.url = details.url;
    if (details.user) editRemoteForm.user = details.user;
    if (details.host) editRemoteForm.host = details.host;
    if (details.port) editRemoteForm.port = details.port;
    if (details.domain) editRemoteForm.domain = details.domain;
    if (details.client_id) editRemoteForm.clientId = details.client_id;
    if (details.client_secret) editRemoteForm.clientSecret = details.client_secret;
    // S3
    if (details.provider) editRemoteForm.s3Provider = details.provider;
    if (details.access_key_id) editRemoteForm.s3AccessKey = details.access_key_id;
    if (details.secret_access_key) editRemoteForm.s3SecretKey = details.secret_access_key;
    if (details.region) editRemoteForm.s3Region = details.region;
    if (details.endpoint) editRemoteForm.s3Endpoint = details.endpoint;
    if (details.force_path_style === "true") editRemoteForm.s3ForcePathStyle = true;
    if (details.env_auth === "true") editRemoteForm.s3EnvAuth = true;
    // B2 / Azure
    if (details.account) editRemoteForm.account = details.account;
    if (details.key) editRemoteForm.key = details.key;
  } catch (err) {
    console.error("加载设置详情失败:", err);
  }

  showEditRemoteModal.value = true;
}

// Submit Edit Remote
async function submitEditRemote() {
  const trimmedNewName = (editRemoteForm.newName || "").trim();
  if (!trimmedNewName) {
    showToast("云端硬盘名称不能为空！", "error");
    return;
  }
  if (/[\\/:*?"<>|\[\]]/.test(trimmedNewName)) {
    showToast("云端硬盘名称不可包含特殊字符 (: / \\ [ ] * ? < > | \")", "error");
    return;
  }

  editRemoteForm.isSaving = true;
  const params = {};

  if (isOAuthType(editRemoteForm.type)) {
    params.client_id = editRemoteForm.clientId.trim();
    params.client_secret = editRemoteForm.clientSecret.trim();
  } else if (editRemoteForm.type.includes("s3")) {
    if (editRemoteForm.s3Provider) params.provider = editRemoteForm.s3Provider;
    if (editRemoteForm.s3AccessKey) params.access_key_id = editRemoteForm.s3AccessKey.trim();
    if (editRemoteForm.s3SecretKey) params.secret_access_key = editRemoteForm.s3SecretKey.trim();
    if (editRemoteForm.s3Region) params.region = editRemoteForm.s3Region.trim();
    if (editRemoteForm.s3Endpoint) params.endpoint = editRemoteForm.s3Endpoint.trim();
    params.force_path_style = editRemoteForm.s3ForcePathStyle ? "true" : "false";
    params.env_auth = editRemoteForm.s3EnvAuth ? "true" : "false";
  } else if (editRemoteForm.type === "webdav") {
    if (editRemoteForm.url) params.url = editRemoteForm.url;
    if (editRemoteForm.user) params.user = editRemoteForm.user;
    if (editRemoteForm.pass) params.pass = editRemoteForm.pass;
  } else if (editRemoteForm.type === "ftp" || editRemoteForm.type === "sftp") {
    if (editRemoteForm.host) params.host = editRemoteForm.host;
    if (editRemoteForm.port) params.port = editRemoteForm.port;
    if (editRemoteForm.user) params.user = editRemoteForm.user;
    if (editRemoteForm.pass) params.pass = editRemoteForm.pass;
  } else if (editRemoteForm.type === "smb") {
    if (editRemoteForm.host) params.host = editRemoteForm.host;
    if (editRemoteForm.port) params.port = editRemoteForm.port;
    if (editRemoteForm.user) params.user = editRemoteForm.user;
    if (editRemoteForm.pass) params.pass = editRemoteForm.pass;
    if (editRemoteForm.domain) params.domain = editRemoteForm.domain;
  } else if (editRemoteForm.type === "b2" || editRemoteForm.type === "azureblob") {
    if (editRemoteForm.account) params.account = editRemoteForm.account.trim();
    if (editRemoteForm.key) params.key = editRemoteForm.key.trim();
  }

  try {
    const oldName = editRemoteForm.name;
    const msg = await invoke("update_remote_gui", {
      rclonePath: customRclonePath.value.trim() || null,
      name: oldName,
      newName: trimmedNewName,
      params
    });

    // If renamed, migrate local storage configs, auto-mount, and scheduled tasks
    if (trimmedNewName !== oldName) {
      if (remoteConfigs[oldName]) {
        remoteConfigs[trimmedNewName] = { ...remoteConfigs[oldName] };
        delete remoteConfigs[oldName];
        saveRemoteConfigs();
      }
      const autoIdx = autoMountList.value.indexOf(oldName);
      if (autoIdx !== -1) {
        autoMountList.value[autoIdx] = trimmedNewName;
        localStorage.setItem("rclone_auto_mount_list", JSON.stringify(autoMountList.value));
      }
      const customIdx = customRemoteOrder.value.indexOf(oldName);
      if (customIdx !== -1) {
        customRemoteOrder.value[customIdx] = trimmedNewName;
        saveSortSettings();
      }
      let changedTasks = false;
      for (const t of scheduledTasks.value) {
        if (t.source && t.source.startsWith(`${oldName}:`)) {
          t.source = t.source.replace(`${oldName}:`, `${trimmedNewName}:`);
          changedTasks = true;
        }
        if (t.dest && t.dest.startsWith(`${oldName}:`)) {
          t.dest = t.dest.replace(`${oldName}:`, `${trimmedNewName}:`);
          changedTasks = true;
        }
      }
      if (changedTasks) {
        localStorage.setItem("rclone_scheduled_tasks", JSON.stringify(scheduledTasks.value));
      }
    }

    showToast(msg || "设置更新成功！", "success");
    showEditRemoteModal.value = false;
    await refreshAll();
  } catch (err) {
    showToast(`更新失败: ${err}`, "error");
  } finally {
    editRemoteForm.isSaving = false;
  }
}

// Re-authenticate OAuth in Browser
async function handleReconnectRemote() {
  editRemoteForm.isReconnecting = true;
  try {
    showToast("已启动浏览器授权登录页面，请在浏览器中同意授权...", "info");
    const msg = await invoke("reconnect_remote_gui", {
      rclonePath: customRclonePath.value.trim() || null,
      name: editRemoteForm.name
    });
    showToast(msg || "重新登录授权成功！", "success");
    await refreshAll();
  } catch (err) {
    showToast(`重新授权失败: ${err}`, "error");
  } finally {
    editRemoteForm.isReconnecting = false;
  }
}

// Delete Remote
async function handleDeleteRemote(name) {
  if (!confirm(`确定要删除云端设置【${name}】吗？这不会删除云端上的文件。`)) return;
  try {
    await invoke("delete_remote_gui", {
      rclonePath: customRclonePath.value.trim() || null,
      name
    });
    if (remoteConfigs[name]) {
      delete remoteConfigs[name];
      saveRemoteConfigs();
    }
    if (customRemoteOrder.value.includes(name)) {
      customRemoteOrder.value = customRemoteOrder.value.filter((n) => n !== name);
      saveSortSettings();
    }
    showToast(`已成功删除 ${name}`, "info");
    await refreshAll();
  } catch (err) {
    showToast(`删除失败: ${err}`, "error");
  }
}

// Web-GUI Toggle & Browser Launch
async function toggleWebGui() {
  try {
    const nextState = !envStatus.value.webgui_running;
    const running = await invoke("toggle_rclone_webgui", {
      rclonePath: customRclonePath.value.trim() || null,
      enable: nextState
    });
    envStatus.value.webgui_running = running;
    showToast(running ? "已在后台启动 Rclone 官方 Web-GUI！" : "已停止 Web-GUI 服务", "info");
  } catch (err) {
    showToast(`Web-GUI 操作失败: ${err}`, "error");
  }
}

async function openWebGuiInBrowser() {
  if (!envStatus.value.webgui_running) {
    await toggleWebGui();
  }
  openUrl(envStatus.value.webgui_url);
}

// Multi-destination Helpers
function addExtraDestination() {
  if (!syncForm.extraDests) syncForm.extraDests = [];
  syncForm.extraDests.push({
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    path: ""
  });
}

function removeExtraDestination(index) {
  if (syncForm.extraDests && syncForm.extraDests[index] !== undefined) {
    syncForm.extraDests.splice(index, 1);
  }
}

function getAllDestinations() {
  const extras = (syncForm.extraDests || []).map((d) => (d.path || "").trim());
  const list = [syncForm.dest ? syncForm.dest.trim() : "", ...extras];
  return list.filter(Boolean);
}

// Browse Native Local Folder
async function pickLocalFolder(target = "source", extraIndex = null) {
  try {
    const selected = await invoke("select_local_folder");
    if (selected) {
      if (target === "source") {
        syncForm.source = selected;
      } else if (target === "extraDest" && extraIndex !== null) {
        if (syncForm.extraDests && syncForm.extraDests[extraIndex]) {
          syncForm.extraDests[extraIndex].path = selected;
        }
      } else {
        syncForm.dest = selected;
      }
      showToast(`已选择文件夹: ${selected}`, "success");
    }
  } catch (err) {
    showToast(`打开文件夹选择窗口失败: ${err}`, "error");
  }
}

// Quick Select Remote Directly
function pickRemoteDirect(remoteName, target = "source", extraIndex = null) {
  const remotePath = `${remoteName}:`;
  if (target === "source") {
    syncForm.source = remotePath;
  } else if (target === "extraDest" && extraIndex !== null) {
    if (syncForm.extraDests && syncForm.extraDests[extraIndex]) {
      syncForm.extraDests[extraIndex].path = remotePath;
    }
  } else {
    syncForm.dest = remotePath;
  }
}

const cloudBrowseExtraIndex = ref(null);

// Cloud Directory Browser
async function openCloudBrowseModal(target = "source", extraIndex = null) {
  cloudBrowseTarget.value = target;
  cloudBrowseExtraIndex.value = extraIndex;
  let currentVal = "";
  if (target === "source") {
    currentVal = syncForm.source;
  } else if (target === "extraDest" && extraIndex !== null && syncForm.extraDests && syncForm.extraDests[extraIndex]) {
    currentVal = syncForm.extraDests[extraIndex].path;
  } else {
    currentVal = syncForm.dest;
  }
  if (currentVal && currentVal.includes(":") && !currentVal.startsWith("C:") && !currentVal.startsWith("D:")) {
    const parts = currentVal.split(":");
    cloudBrowseRemote.value = parts[0];
    cloudBrowseCurrentSubpath.value = parts.slice(1).join(":") || "";
  } else if (remotes.value.length > 0) {
    cloudBrowseRemote.value = remotes.value[0].name;
    cloudBrowseCurrentSubpath.value = "";
  } else {
    showToast("尚未创建任何云端硬盘，请先在第一页添加！", "error");
    return;
  }
  showCloudBrowseModal.value = true;
  await fetchCloudDirs();
}

async function fetchCloudDirs() {
  if (!cloudBrowseRemote.value) return;
  isLoadingCloudDirs.value = true;
  cloudBrowseDirs.value = [];
  try {
    const fullRemotePath = cloudBrowseCurrentSubpath.value
      ? `${cloudBrowseRemote.value}:${cloudBrowseCurrentSubpath.value}`
      : `${cloudBrowseRemote.value}:`;
    const dirs = await invoke("list_remote_dirs", {
      rclonePath: customRclonePath.value.trim() || null,
      remotePath: fullRemotePath
    });
    cloudBrowseDirs.value = dirs;
  } catch (err) {
    showToast(`读取云端目录失败: ${err}`, "error");
  } finally {
    isLoadingCloudDirs.value = false;
  }
}

function enterCloudSubdir(dirName) {
  if (cloudBrowseCurrentSubpath.value) {
    cloudBrowseCurrentSubpath.value = `${cloudBrowseCurrentSubpath.value}/${dirName}`;
  } else {
    cloudBrowseCurrentSubpath.value = dirName;
  }
  fetchCloudDirs();
}

function goCloudParentDir() {
  if (!cloudBrowseCurrentSubpath.value) return;
  const parts = cloudBrowseCurrentSubpath.value.split("/");
  parts.pop();
  cloudBrowseCurrentSubpath.value = parts.join("/");
  fetchCloudDirs();
}

function confirmCloudBrowseSelect() {
  const finalPath = cloudBrowseCurrentSubpath.value
    ? `${cloudBrowseRemote.value}:${cloudBrowseCurrentSubpath.value}`
    : `${cloudBrowseRemote.value}:`;
  if (cloudBrowseTarget.value === "source") {
    syncForm.source = finalPath;
  } else if (cloudBrowseTarget.value === "extraDest" && cloudBrowseExtraIndex.value !== null) {
    if (syncForm.extraDests && syncForm.extraDests[cloudBrowseExtraIndex.value]) {
      syncForm.extraDests[cloudBrowseExtraIndex.value].path = finalPath;
    }
  } else {
    syncForm.dest = finalPath;
  }
  showCloudBrowseModal.value = false;
  showToast(`已选择云端路径: ${finalPath}`, "success");
}

// Filtered Diff Items (RcloneView style)
const filteredDiffItems = computed(() => {
  if (!syncForm.diffResult || !syncForm.diffResult.items) return [];
  const keyword = syncForm.searchKeyword.trim().toLowerCase();
  return syncForm.diffResult.items.filter((item) => {
    // Status display toggle
    if (!syncForm.filterModes[item.status]) return false;
    // Keyword search
    if (keyword && !item.path.toLowerCase().includes(keyword)) return false;
    return true;
  });
});

function toggleFilterMode(mode) {
  syncForm.filterModes[mode] = !syncForm.filterModes[mode];
}

function toggleSelectAllVisible() {
  const visible = filteredDiffItems.value;
  const allSelected = visible.length > 0 && visible.every((item) => syncForm.selectedItems.has(item.path));
  if (allSelected) {
    visible.forEach((item) => syncForm.selectedItems.delete(item.path));
  } else {
    visible.forEach((item) => syncForm.selectedItems.add(item.path));
  }
}

function toggleItemSelect(path) {
  if (syncForm.selectedItems.has(path)) {
    syncForm.selectedItems.delete(path);
  } else {
    syncForm.selectedItems.add(path);
  }
}

// RcloneView Plus Compare / Check Diff
async function handleCheckDiff() {
  if (!syncForm.source || !syncForm.dest) {
    showToast("请先选择或填写来源与目标路径！", "error");
    return;
  }
  syncForm.isChecking = true;
  syncForm.diffResult = null;
  syncForm.selectedItems.clear();

  const excludePatterns = syncForm.excludeFilter
    ? syncForm.excludeFilter.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  try {
    const res = await invoke("check_folder_diff", {
      rclonePath: customRclonePath.value.trim() || null,
      source: syncForm.source.trim(),
      dest: syncForm.dest.trim(),
      excludePatterns
    });
    syncForm.diffResult = res;
    showToast(res.message, "success");
  } catch (err) {
    showToast(`比对失败: ${err}`, "error");
  } finally {
    syncForm.isChecking = false;
  }
}

// Copy Selected Items
async function handleCopySelected() {
  if (syncForm.selectedItems.size === 0) {
    showToast("请先勾选要拷贝的文件！", "error");
    return;
  }
  syncForm.isCopyingSelected = true;
  try {
    const filesToCopy = Array.from(syncForm.selectedItems);
    const log = await invoke("copy_specific_files", {
      rclonePath: customRclonePath.value.trim() || null,
      source: syncForm.source.trim(),
      dest: syncForm.dest.trim(),
      files: filesToCopy
    });
    syncForm.taskLog = log;
    showToast(`成功拷贝 ${filesToCopy.length} 个文件！`, "success");
    syncForm.selectedItems.clear();
    await handleCheckDiff();
  } catch (err) {
    showToast(`拷贝失败: ${err}`, "error");
  } finally {
    syncForm.isCopyingSelected = false;
  }
}

// Copy Single File
async function handleCopySingleFile(filePath) {
  syncForm.isCopyingSelected = true;
  try {
    const log = await invoke("copy_specific_files", {
      rclonePath: customRclonePath.value.trim() || null,
      source: syncForm.source.trim(),
      dest: syncForm.dest.trim(),
      files: [filePath]
    });
    syncForm.taskLog = log;
    showToast(`成功拷贝: ${filePath}`, "success");
    await handleCheckDiff();
  } catch (err) {
    showToast(`拷贝失败: ${err}`, "error");
  } finally {
    syncForm.isCopyingSelected = false;
  }
}

// Open Schedule Modal or Batch Create from Sync Page
function openScheduleFromSync() {
  const allDests = getAllDestinations();
  if (!syncForm.source || allDests.length === 0) {
    showToast("请先选择或填写来源与至少一个目的路径！", "error");
    return;
  }
  const cleanSrc = syncForm.source.replace(/[\\/]+$/, "");
  const srcName = cleanSrc.split(/[\\/:]/).pop() || cleanSrc;

  if (allDests.length === 1) {
    const cleanDst = allDests[0].replace(/[\\/]+$/, "");
    const dstName = cleanDst.split(/[\\/:]/).pop() || cleanDst;
    newTask.name = `定时${syncForm.action === 'sync' ? '镜像同步' : '增量备份'}: ${srcName} ➔ ${dstName}`;
    newTask.source = syncForm.source.trim();
    newTask.dest = allDests[0];
    newTask.action = syncForm.action;
    newTask.excludeFilter = syncForm.excludeFilter ? syncForm.excludeFilter.trim() : "";
    newTask.intervalMinutes = 60;
    newTask.enabled = true;
    showAddTaskModal.value = true;
  } else {
    let addedCount = 0;
    for (const d of allDests) {
      const cleanDst = d.replace(/[\\/]+$/, "");
      const dstName = cleanDst.split(/[\\/:]/).pop() || cleanDst;
      scheduledTasks.value.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
        name: `定时${syncForm.action === 'sync' ? '同步' : '备份'}: ${srcName} ➔ ${dstName}`,
        source: syncForm.source.trim(),
        dest: d,
        action: syncForm.action,
        excludeFilter: syncForm.excludeFilter ? syncForm.excludeFilter.trim() : "",
        intervalMinutes: 60,
        enabled: true,
        lastRun: "从未运行",
        status: "待命"
      });
      addedCount++;
    }
    saveScheduledTasks();
    showToast(`已成功为 ${addedCount} 个目的地创建后台调度任务！`, "success");
    activeTab.value = "scheduler";
  }
}

// RcloneView Plus Run Sync Job (Supports Multi-Destination)
async function handleRunSync() {
  const allDests = getAllDestinations();
  if (!syncForm.source || allDests.length === 0) {
    showToast("请先选择或填写来源与至少一个目的路径！", "error");
    return;
  }
  syncForm.isRunning = true;
  syncForm.taskLog = `正在运行同步任务中（共 ${allDests.length} 个目的地）...`;

  const excludePatterns = syncForm.excludeFilter
    ? syncForm.excludeFilter.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  let successCount = 0;
  let failCount = 0;
  const logs = [];

  try {
    for (let i = 0; i < allDests.length; i++) {
      const curDest = allDests[i];
      const prefix = `[${i + 1}/${allDests.length}]`;
      showToast(`正在传输至目的地 ${prefix}: ${curDest}...`, "info");
      logs.push(`==================================================`);
      logs.push(`${prefix} 开始同步: ${syncForm.source.trim()} ➔ ${curDest}`);
      logs.push(`==================================================`);
      syncForm.taskLog = logs.join("\n");

      try {
        const log = await invoke("run_sync_task", {
          rclonePath: customRclonePath.value.trim() || null,
          action: syncForm.action,
          source: syncForm.source.trim(),
          dest: curDest,
          excludePatterns
        });
        logs.push(log || "任务运行完成！");
        successCount++;
      } catch (destErr) {
        logs.push(`❌ 此目的地同步失败: ${destErr}`);
        failCount++;
      }
      syncForm.taskLog = logs.join("\n");
    }

    if (failCount === 0) {
      showToast(`同步/备份全部成功！共传输至 ${successCount} 个目的地！`, "success");
    } else {
      showToast(`同步完成：${successCount} 个成功，${failCount} 个失败，请查看日志！`, "warning");
    }

    // 若勾选自动加入调度，为所有目的地加入后台定时调度
    if (syncForm.autoAddToScheduler) {
      let addedCount = 0;
      for (const curDest of allDests) {
        const cleanSrc = syncForm.source.replace(/[\\/]+$/, "");
        const cleanDst = curDest.replace(/[\\/]+$/, "");
        const srcName = cleanSrc.split(/[\\/:]/).pop() || cleanSrc;
        const dstName = cleanDst.split(/[\\/:]/).pop() || cleanDst;

        const exists = scheduledTasks.value.some(
          (t) => t.source === syncForm.source.trim() && t.dest === curDest
        );
        if (!exists) {
          const task = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
            name: `自动${syncForm.action === 'sync' ? '同步' : '备份'}: ${srcName} ➔ ${dstName}`,
            source: syncForm.source.trim(),
            dest: curDest,
            action: syncForm.action,
            excludeFilter: syncForm.excludeFilter ? syncForm.excludeFilter.trim() : "",
            intervalMinutes: 60,
            enabled: true,
            lastRun: new Date().toLocaleTimeString(),
            lastRunTs: Date.now(),
            status: "成功完成"
          };
          scheduledTasks.value.push(task);
          addedCount++;
        }
      }
      if (addedCount > 0) {
        saveScheduledTasks();
        showToast(`已为您将 ${addedCount} 个目的地自动加入后台定时调度！`, "success");
      }
    }

    await handleCheckDiff();
  } catch (err) {
    syncForm.taskLog = `整体任务错误: ${err}`;
    showToast(`任务失败: ${err}`, "error");
  } finally {
    syncForm.isRunning = false;
  }
}

// Scheduler: Add Task
function submitAddTask() {
  if (!newTask.name.trim() || !newTask.source.trim() || !newTask.dest.trim()) {
    showToast("请填写完整的任务信息！", "error");
    return;
  }
  const task = {
    id: Date.now().toString(),
    name: newTask.name.trim(),
    source: newTask.source.trim(),
    dest: newTask.dest.trim(),
    action: newTask.action,
    excludeFilter: newTask.excludeFilter ? newTask.excludeFilter.trim() : "",
    intervalMinutes: Number(newTask.intervalMinutes) || 60,
    enabled: true,
    lastRun: "从未运行",
    status: "待命"
  };
  scheduledTasks.value.push(task);
  saveScheduledTasks();
  showAddTaskModal.value = false;
  newTask.name = "";
  newTask.source = "";
  newTask.dest = "";
  newTask.excludeFilter = "";
  showToast("已成功创建调度任务！程序常驻右下角时将自动定时运行", "success");
}

function removeTask(id) {
  scheduledTasks.value = scheduledTasks.value.filter((t) => t.id !== id);
  saveScheduledTasks();
  showToast("已删除任务", "info");
}

function toggleTaskEnabled(task) {
  task.enabled = !task.enabled;
  saveScheduledTasks();
}

function openEditTaskModal(task) {
  editTaskForm.id = task.id;
  editTaskForm.name = task.name || "";
  editTaskForm.source = task.source || "";
  editTaskForm.dest = task.dest || "";
  editTaskForm.action = task.action || "copy";
  editTaskForm.excludeFilter = task.excludeFilter || "";
  editTaskForm.intervalMinutes = task.intervalMinutes || 60;
  editTaskForm.enabled = task.enabled !== false;
  showEditTaskModal.value = true;
}

function submitEditTask() {
  if (!editTaskForm.name.trim() || !editTaskForm.source.trim() || !editTaskForm.dest.trim()) {
    showToast("请填写完整的任务信息！", "error");
    return;
  }
  const task = scheduledTasks.value.find((t) => t.id === editTaskForm.id);
  if (!task) {
    showToast("找不到对应的调度任务！", "error");
    return;
  }
  task.name = editTaskForm.name.trim();
  task.source = editTaskForm.source.trim();
  task.dest = editTaskForm.dest.trim();
  task.action = editTaskForm.action;
  task.excludeFilter = editTaskForm.excludeFilter ? editTaskForm.excludeFilter.trim() : "";
  task.intervalMinutes = Math.max(1, Number(editTaskForm.intervalMinutes) || 60);
  task.enabled = editTaskForm.enabled;
  saveScheduledTasks();
  showEditTaskModal.value = false;
  showToast("已成功更新调度任务设置！", "success");
}

async function executeTaskNow(task) {
  if (task.status === "运行中...") {
    showToast("任务正在运行中，请稍候...", "info");
    return;
  }
  task.status = "运行中...";
  task.lastRun = new Date().toLocaleTimeString();
  task.lastRunTs = Date.now();
  saveScheduledTasks();
  showToast(`开始运行任务「${task.name}」...`, "info");
  try {
    const excludePatterns = task.excludeFilter
      ? task.excludeFilter.split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    await invoke("run_sync_task", {
      rclonePath: customRclonePath.value.trim() || null,
      action: task.action,
      source: task.source,
      dest: task.dest,
      excludePatterns
    });
    task.status = "成功完成";
    saveScheduledTasks();
    showToast(`调度任务「${task.name}」运行成功！`, "success");
  } catch (err) {
    task.status = "运行失败";
    saveScheduledTasks();
    showToast(`任务「${task.name}」失败: ${err}`, "error");
  }
}

function saveScheduledTasks() {
  localStorage.setItem("rclone_scheduled_tasks", JSON.stringify(scheduledTasks.value));
}

// Scheduler cycle
function runSchedulerCycle() {
  const now = Date.now();
  scheduledTasks.value.forEach(async (task) => {
    if (!task.enabled) return;
    const intervalMs = (task.intervalMinutes || 60) * 60 * 1000;
    const lastRunTs = task.lastRunTs || 0;
    if (now - lastRunTs >= intervalMs) {
      task.status = "运行中...";
      task.lastRunTs = now;
      task.lastRun = new Date().toLocaleTimeString();
      try {
        const excludePatterns = task.excludeFilter
          ? task.excludeFilter.split(",").map((s) => s.trim()).filter(Boolean)
          : null;
        await invoke("run_sync_task", {
          rclonePath: customRclonePath.value.trim() || null,
          action: task.action,
          source: task.source,
          dest: task.dest,
          excludePatterns
        });
        task.status = "成功完成";
      } catch (err) {
        task.status = "运行失败";
      }
      saveScheduledTasks();
    }
  });
}

function toggleRemoteAutoMount(remoteName) {
  const conf = remoteConfigs[remoteName];
  if (!conf) return;
  conf.autoMount = !conf.autoMount;
  let list = [...autoMountList.value];
  if (conf.autoMount) {
    if (!list.includes(remoteName)) list.push(remoteName);
  } else {
    list = list.filter((n) => n !== remoteName);
  }
  autoMountList.value = list;
  localStorage.setItem("rclone_auto_mount_list", JSON.stringify(list));
  saveRemoteConfigs();
}

function saveCustomPath() {
  localStorage.setItem("rclone_custom_path", customRclonePath.value);
  showToast("已保存 Rclone 路径设置！", "success");
  refreshAll();
}

const isInstallingRclone = ref(false);
const isInstallingWinFsp = ref(false);

async function handleAutoInstallRclone() {
  if (isInstallingRclone.value) return;
  isInstallingRclone.value = true;
  showToast("正在从官方下载并配置 Rclone 最新版，请稍候...", "info");
  try {
    const installedPath = await invoke("auto_install_rclone");
    customRclonePath.value = installedPath;
    localStorage.setItem("rclone_custom_path", installedPath);
    showToast(`Rclone 自动配置成功！已安装于：${installedPath}`, "success");
    await refreshAll();
  } catch (err) {
    showToast(`自动安装 Rclone 失败: ${err}`, "error");
  } finally {
    isInstallingRclone.value = false;
  }
}

async function handleAutoInstallWinFsp() {
  if (isInstallingWinFsp.value) return;
  isInstallingWinFsp.value = true;
  showToast("正在下载 WinFsp 官方安装程序，下载完成后将自动启动安装向导...", "info");
  try {
    await invoke("auto_install_winfsp");
    showToast("WinFsp 安装向导已启动！请于 Windows 安装向导中点击下一步完成安装。", "success");
    await refreshAll();
  } catch (err) {
    showToast(`下载或安装 WinFsp 失败: ${err}`, "error");
  } finally {
    isInstallingWinFsp.value = false;
  }
}

async function handleAutoInstallAll() {
  if (!envStatus.value.rclone_found) {
    await handleAutoInstallRclone();
  }
  if (!envStatus.value.winfsp_found) {
    await handleAutoInstallWinFsp();
  }
}

const mountedCount = computed(() => remotes.value.filter((r) => r.is_mounted).length);
const totalCount = computed(() => remotes.value.length);
const isPrerequisiteMissing = computed(() => !envStatus.value.rclone_found || !envStatus.value.winfsp_found);

onMounted(async () => {
  applyTheme(isLightMode.value);
  await checkAutostart();
  await refreshAll(true);
  loadSupportedProviders();
  schedulerTimer = setInterval(runSchedulerCycle, 60000);
  setTimeout(() => {
    checkForUpdates(false);
  }, 2500);
});

onUnmounted(() => {
  if (schedulerTimer) clearInterval(schedulerTimer);
});
</script>

<template>
  <div class="app-layout" :data-theme="isLightMode ? 'light' : 'dark'">
    <!-- Header -->
    <header class="app-header">
      <div class="brand">
        <div class="logo-box">
          <HardDrive class="logo-icon" />
          <span class="logo-pulse"></span>
        </div>
        <div>
          <div class="brand-title-row">
            <h1 class="brand-title">Rclone Drive & Sync</h1>
            <span class="app-version-badge" @click="checkForUpdates(true)" title="当前版本 v{{ CURRENT_VERSION }}（点击检查更新）">
              v{{ CURRENT_VERSION }}
            </span>
          </div>
          <p class="brand-subtitle">云端硬盘挂载 • 参数修改 • 差异比对 • 定时调度</p>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <nav class="nav-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'mounts' }"
          @click="activeTab = 'mounts'"
        >
          <HardDrive class="tab-icon" />
          <span>硬盘挂载 (RaiDrive)</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'sync' }"
          @click="activeTab = 'sync'"
        >
          <ArrowRightLeft class="tab-icon" />
          <span>同步与比对 (Sync & Diff)</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'scheduler' }"
          @click="activeTab = 'scheduler'"
        >
          <CalendarClock class="tab-icon" />
          <span>调度任务 ({{ scheduledTasks.length }})</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'webgui' }"
          @click="activeTab = 'webgui'"
        >
          <Globe class="tab-icon" />
          <span>Rclone Web-GUI</span>
        </button>
      </nav>

      <!-- Global Actions -->
      <div class="header-actions">
        <button
          class="btn btn-secondary"
          @click="checkForUpdates(true)"
          :disabled="isCheckingUpdate"
          title="检查 GitHub 最新版本"
        >
          <DownloadCloud class="btn-icon" :class="{ 'spin-anim': isCheckingUpdate }" />
          <span class="btn-text-hide-sm">检查更新</span>
        </button>

        <button class="btn btn-secondary" @click="toggleTheme" :title="isLightMode ? '切换为深色主题' : '切换为浅色主题'">
          <Sun v-if="isLightMode" class="btn-icon text-amber" />
          <Moon v-else class="btn-icon" />
        </button>

        <button class="btn btn-secondary" @click="refreshAll(false)" :disabled="isRefreshing" title="刷新">
          <RefreshCw class="btn-icon" :class="{ 'spin-anim': isRefreshing }" />
        </button>

        <button class="btn btn-secondary" @click="showSettings = true" title="偏好设置">
          <Settings class="btn-icon" />
        </button>
      </div>
    </header>

    <!-- Missing Prerequisites Warning Banner -->
    <div v-if="isPrerequisiteMissing" class="prereq-alert-banner">
      <div class="prereq-content">
        <div class="prereq-header">
          <AlertTriangle class="prereq-warn-icon" />
          <span class="prereq-title">系统检测到缺少必要组件，云端硬盘挂载功能需要以下工具：</span>
          <button
            v-if="!envStatus.rclone_found && !envStatus.winfsp_found"
            class="btn btn-emerald btn-sm ml-auto"
            :disabled="isInstallingRclone || isInstallingWinFsp"
            @click="handleAutoInstallAll"
          >
            <Zap class="btn-icon" />
            <span>⚡ 一键自动安装全部必要组件</span>
          </button>
        </div>

        <div class="prereq-cards-row">
          <!-- Rclone Missing Card -->
          <div v-if="!envStatus.rclone_found" class="prereq-item-card">
            <div class="prereq-card-text">
              <span class="prereq-badge">必要组件 1</span>
              <h4>Rclone 核心可执行文件</h4>
              <p>默认检查路径 <code>C:\rclone\rclone.exe</code> 尚未找到可执行文件。</p>
            </div>
            <div class="prereq-btn-group">
              <button
                class="btn btn-download"
                :disabled="isInstallingRclone"
                @click="handleAutoInstallRclone"
              >
                <DownloadCloud class="btn-icon" :class="{ 'spin-anim': isInstallingRclone }" />
                <span>{{ isInstallingRclone ? '正在自动下载配置中...' : '⚡ 一键自动下载配置 Rclone' }}</span>
              </button>
              <button class="btn btn-download-alt" @click="openUrl('https://rclone.org/downloads/')">
                <ExternalLink class="btn-icon" />
                <span>官网手动下载</span>
              </button>
            </div>
          </div>

          <!-- WinFsp Missing Card -->
          <div v-if="!envStatus.winfsp_found" class="prereq-item-card">
            <div class="prereq-card-text">
              <span class="prereq-badge">必要组件 2</span>
              <h4>WinFsp 文件系统核心</h4>
              <p>Windows 虚拟文件系统驱动，未安装将无法创建本机盘符。</p>
            </div>
            <div class="prereq-btn-group">
              <button
                class="btn btn-download"
                :disabled="isInstallingWinFsp"
                @click="handleAutoInstallWinFsp"
              >
                <DownloadCloud class="btn-icon" :class="{ 'spin-anim': isInstallingWinFsp }" />
                <span>{{ isInstallingWinFsp ? '正在下载并启动安装程序...' : '⚡ 一键下载安装 WinFsp' }}</span>
              </button>
              <button class="btn btn-download-alt" @click="openUrl('https://winfsp.dev/')">
                <ExternalLink class="btn-icon" />
                <span>官网手动下载</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Status Bar -->
    <div class="env-banner">
      <div class="env-item" :class="{ 'env-ok': envStatus.rclone_found, 'env-warn': !envStatus.rclone_found }">
        <component :is="envStatus.rclone_found ? CheckCircle2 : AlertTriangle" class="env-icon" />
        <span v-if="envStatus.rclone_found">Rclone: {{ envStatus.rclone_version ? (envStatus.rclone_version.toLowerCase().startsWith('rclone') ? envStatus.rclone_version.replace(/^rclone\s*/i, '') : envStatus.rclone_version) : '已连接' }}</span>
        <span v-else class="clickable-link" @click="handleAutoInstallRclone" title="点击直接后台下载并自动配置 Rclone">
          Rclone: 尚未安装 (⚡ 点此一键安装)
        </span>
      </div>

      <div class="env-item" :class="{ 'env-ok': envStatus.winfsp_found, 'env-warn': !envStatus.winfsp_found }">
        <component :is="envStatus.winfsp_found ? ShieldCheck : AlertTriangle" class="env-icon" />
        <span v-if="envStatus.winfsp_found">WinFsp: 已就绪 (正常运作)</span>
        <span v-else class="clickable-link" @click="handleAutoInstallWinFsp" title="点击直接下载 WinFsp 并启动安装向导">
          WinFsp: 尚未安装 (⚡ 点此一键安装)
        </span>
      </div>

      <div class="env-item" :class="{ 'env-ok': envStatus.webgui_running, 'env-neutral': !envStatus.webgui_running }">
        <Globe class="env-icon" />
        <span>Web-GUI: {{ envStatus.webgui_running ? '127.0.0.1:5572 (运行中)' : '已停止' }}</span>
      </div>

      <div class="env-item env-neutral" v-if="autostartActive">
        <Check class="env-icon text-emerald" />
        <span>开机自启动: 已启用</span>
      </div>

      <div class="env-item env-neutral ml-auto">
        <span class="count-pill">
          <span class="indicator-dot active"></span>
          已挂载: {{ mountedCount }} / {{ totalCount }}
        </span>
      </div>
    </div>

    <!-- Main Content Area -->
    <main class="main-content">
      <!-- TAB 1: MOUNTS (RaiDrive Clone) -->
      <section v-if="activeTab === 'mounts'" class="tab-pane">
        <!-- Sub Bar -->
        <div class="sub-bar">
          <div class="sub-title-group">
            <h2>云端硬盘挂载列表</h2>
            <p>已挂载为标准 Windows 网络磁盘，支持即点即用与在线读写，点击右上角 ✏️ 可直接修改设置与重新授权</p>
          </div>
          <div class="sub-actions">
            <!-- Sort Controls -->
            <div v-if="remotes.length > 0" class="sort-select-wrapper" title="云端硬盘列表排序方式">
              <ArrowUpDown class="sort-icon" />
              <span class="sort-label">排序:</span>
              <select v-model="mountSortBy" @change="onSortChange" class="sort-select">
                <option value="default">默认配置</option>
                <option value="custom">自定义顺序 (支持上移/下移)</option>
                <option value="name-asc">名称 (A → Z)</option>
                <option value="name-desc">名称 (Z → A)</option>
                <option value="drive-asc">盘符 (A → Z)</option>
                <option value="drive-desc">盘符 (Z → A)</option>
                <option value="mounted-first">挂载状态 (已挂载优先)</option>
                <option value="unmounted-first">挂载状态 (未挂载优先)</option>
                <option value="type">云端类型 (服务商)</option>
              </select>
            </div>

            <button class="btn btn-primary" @click="showAddRemoteModal = true">
              <PlusCircle class="btn-icon" />
              <span>添加云端硬盘</span>
            </button>
            <button class="btn btn-secondary" @click="mountAll" :disabled="mountedCount === totalCount || totalCount === 0 || isPrerequisiteMissing">
              <Disc3 class="btn-icon" />
              <span>挂载全部</span>
            </button>
            <button class="btn btn-danger-outline" @click="unmountAll" :disabled="mountedCount === 0">
              <Power class="btn-icon" />
              <span>卸载全部</span>
            </button>
          </div>
        </div>

        <!-- Cards Grid -->
        <div v-if="sortedRemotes.length > 0" class="cards-grid">
          <div
            v-for="(remote, index) in sortedRemotes"
            :key="remote.name"
            class="drive-card"
            :class="{ 'card-mounted': remote.is_mounted, 'card-loading': loadingRemotes.has(remote.name) }"
          >
            <!-- Card Header -->
            <div class="card-header">
              <div class="provider-badge" :style="{ backgroundColor: getProviderDetails(remote.remote_type).bg }">
                <Cloud class="provider-icon" :style="{ color: getProviderDetails(remote.remote_type).color }" />
              </div>

              <div class="remote-meta">
                <div class="remote-name" :title="remote.name">{{ remote.name }}</div>
                <div class="remote-type-tag">
                  {{ getProviderDetails(remote.remote_type).name }}
                </div>
              </div>

              <div class="mount-status-badge" :class="remote.is_mounted ? 'status-mounted' : 'status-unmounted'">
                <span class="status-dot"></span>
                {{ remote.is_mounted ? `已挂载 (${remote.mounted_drive})` : '未挂载' }}
              </div>

              <!-- Reorder & Action Buttons -->
              <div class="card-header-actions">
                <div class="reorder-btns" title="调整卡片显示顺序 (点击将自动切换为自定义排序)">
                  <button
                    class="icon-btn-action icon-btn-reorder"
                    :disabled="index === 0"
                    @click.stop="moveRemote(remote.name, -1)"
                    title="向上移动"
                  >
                    <ArrowUp class="action-icon" />
                  </button>
                  <button
                    class="icon-btn-action icon-btn-reorder"
                    :disabled="index === sortedRemotes.length - 1"
                    @click.stop="moveRemote(remote.name, 1)"
                    title="向下移动"
                  >
                    <ArrowDown class="action-icon" />
                  </button>
                </div>

                <template v-if="!remote.is_mounted">
                  <button
                    class="icon-btn-action"
                    @click="openEditModal(remote)"
                    title="修改此云端硬盘设置"
                  >
                    <Pencil class="action-icon" />
                  </button>
                  <button
                    class="icon-btn-delete"
                    @click="handleDeleteRemote(remote.name)"
                    title="删除此云端设置"
                  >
                    <Trash2 class="trash-icon" />
                  </button>
                </template>
              </div>
            </div>

            <!-- Card Body / Settings -->
            <div class="card-body">
              <!-- Drive Letter -->
              <div class="setting-row">
                <label class="field-label">盘符</label>
                <div class="drive-select-wrapper">
                  <select
                    v-if="!remote.is_mounted"
                    v-model="remoteConfigs[remote.name].driveLetter"
                    @change="saveRemoteConfigs"
                    class="drive-select"
                  >
                    <option v-for="letter in availableDrives" :key="letter" :value="letter">
                      磁盘 {{ letter }}
                    </option>
                    <option v-if="!availableDrives.includes(remoteConfigs[remote.name]?.driveLetter)" :value="remoteConfigs[remote.name]?.driveLetter">
                      磁盘 {{ remoteConfigs[remote.name]?.driveLetter }}
                    </option>
                  </select>
                  <div v-else class="drive-locked">
                    <HardDrive class="drive-letter-icon" />
                    <span>磁盘 {{ remote.mounted_drive }}</span>
                  </div>
                </div>
              </div>

              <!-- Volume Name -->
              <div class="setting-row" v-if="!remote.is_mounted">
                <label class="field-label">硬盘显示名称</label>
                <input
                  type="text"
                  v-model="remoteConfigs[remote.name].volname"
                  @change="saveRemoteConfigs"
                  @blur="saveRemoteConfigs"
                  class="field-input"
                  placeholder="资源管理器中显示的名称"
                />
              </div>

              <!-- Cache Mode -->
              <div class="setting-row" v-if="!remote.is_mounted">
                <label class="field-label">缓存模式</label>
                <select
                  v-model="remoteConfigs[remote.name].cacheMode"
                  @change="saveRemoteConfigs"
                  class="field-select"
                >
                  <option value="full">Full (推荐, 支持 Office/多数软件)</option>
                  <option value="writes">Writes (仅写入缓存)</option>
                  <option value="minimal">Minimal (最低缓存)</option>
                  <option value="off">关闭 (只读或纯流式)</option>
                </select>
              </div>

              <!-- Performance Preset Selector -->
              <div class="setting-row" v-if="!remote.is_mounted">
                <div class="perf-preset-header">
                  <label class="field-label">
                    <span>性能预设 (Preset)</span>
                  </label>
                  <button
                    type="button"
                    class="btn-toggle-adv"
                    :class="{ active: expandedAdvancedOpts[remote.name] }"
                    @click="toggleAdvancedOpts(remote.name)"
                    title="展开/收合性能微调选项"
                  >
                    <SlidersHorizontal class="btn-adv-icon" />
                    <span>{{ expandedAdvancedOpts[remote.name] ? '收合微调' : '微调参数' }}</span>
                    <ChevronDown class="btn-chevron-icon" :class="{ rotated: expandedAdvancedOpts[remote.name] }" />
                  </button>
                </div>
                <div class="preset-pill-group">
                  <button
                    type="button"
                    class="preset-pill"
                    :class="{ active: (remoteConfigs[remote.name]?.mountPreset || 'fast') === 'fast' }"
                    @click="applyPresetToRemote(remote.name, 'fast')"
                  >
                    <Zap class="pill-icon" />
                    <span>极速推荐</span>
                  </button>
                  <button
                    type="button"
                    class="preset-pill"
                    :class="{ active: remoteConfigs[remote.name]?.mountPreset === 'default' }"
                    @click="applyPresetToRemote(remote.name, 'default')"
                  >
                    <Gauge class="pill-icon" />
                    <span>官方平衡</span>
                  </button>
                  <button
                    type="button"
                    class="preset-pill"
                    :class="{ active: remoteConfigs[remote.name]?.mountPreset === 'custom' }"
                    @click="applyPresetToRemote(remote.name, 'custom')"
                  >
                    <Sliders class="pill-icon" />
                    <span>自定义高级</span>
                  </button>
                </div>

                <div class="preset-hint-box" v-if="!expandedAdvancedOpts[remote.name]">
                  <p v-if="(remoteConfigs[remote.name]?.mountPreset || 'fast') === 'fast'" class="hint-fast">
                    ⚡ <b>极速推荐</b>：72h 长效目录缓存、10m 属性缓存、抑制 modtime 查找、50G 磁盘缓存与非阻塞后台预热，秒开零冻结！
                  </p>
                  <p v-else-if="remoteConfigs[remote.name]?.mountPreset === 'default'" class="hint-default">
                    ⚖️ <b>官方平衡</b>：Rclone 官方默认行为 (5m 目录缓存、1s 属性超时、关闭后台预热)。
                  </p>
                  <p v-else class="hint-custom">
                    🛠️ <b>自定义微调</b>：已应用各自的自定义缓存超时、切片大小或节流设置。
                  </p>
                </div>
              </div>

              <!-- Expanded Advanced Performance Options -->
              <div
                class="advanced-opts-panel"
                v-if="!remote.is_mounted && expandedAdvancedOpts[remote.name] && remoteConfigs[remote.name]?.mountOptions"
              >
                <div class="adv-panel-title">
                  <SlidersHorizontal class="panel-title-icon" />
                  <span>目录、磁盘缓存与 Google Drive 节流微调</span>
                </div>

                <!-- 1. 目录与属性缓存 -->
                <div class="adv-section-title">1. 目录与属性缓存（解决目录浏览卡顿）</div>
                <div class="adv-grid">
                  <div class="adv-field">
                    <label class="adv-label" title="--dir-cache-time">长效目录缓存</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.dirCacheTime"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="72h">72 小时 (推荐, 秒开目录)</option>
                      <option value="24h">24 小时</option>
                      <option value="7d">7 天 (极速静态)</option>
                      <option value="1h">1 小时</option>
                      <option value="5m">5 分钟 (Rclone 默认)</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--poll-interval">远程变更轮询</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.pollInterval"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="1m">1 分钟 (推荐)</option>
                      <option value="30s">30 秒 (高频同步)</option>
                      <option value="5m">5 分钟</option>
                      <option value="0">0 (禁用轮询)</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--attr-timeout">内核属性缓存超时</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.attrTimeout"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="10m">10 分钟 (推荐, 防资源管理器假死)</option>
                      <option value="5m">5 分钟</option>
                      <option value="1h">1 小时</option>
                      <option value="1s">1 秒 (Rclone 默认)</option>
                    </select>
                  </div>

                  <div class="adv-field-toggle">
                    <div class="toggle-info">
                      <span class="adv-toggle-label" title="--no-modtime">抑制修改时间频繁查找 (--no-modtime)</span>
                      <span class="adv-toggle-desc">避免资源管理器枚举时逐一读取远程 mtime，极大加速小文件目录加载</span>
                    </div>
                    <button
                      type="button"
                      class="toggle-switch-sm"
                      :class="{ active: remoteConfigs[remote.name].mountOptions.noModtime }"
                      @click="remoteConfigs[remote.name].mountOptions.noModtime = !remoteConfigs[remote.name].mountOptions.noModtime; onCustomMountOptionChange(remote.name)"
                    >
                      <span class="toggle-slider-sm"></span>
                    </button>
                  </div>
                </div>

                <!-- 2. VFS 磁盘缓存与切片 -->
                <div class="adv-section-title">2. VFS 磁盘缓存与切片读取（解决点击/预览冻结）</div>
                <div class="adv-grid">
                  <div class="adv-field">
                    <label class="adv-label" title="--vfs-cache-max-size">磁盘缓存配额上限</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.vfsCacheMaxSize"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="50G">50 GB (推荐, 流畅预览/播放)</option>
                      <option value="20G">20 GB</option>
                      <option value="100G">100 GB</option>
                      <option value="off">无限制 (off)</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--vfs-cache-max-age">缓存文件保留上限</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.vfsCacheMaxAge"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="24h">24 小时 (推荐)</option>
                      <option value="48h">48 小时</option>
                      <option value="7d">7 天</option>
                      <option value="1h">1 小时</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--vfs-read-chunk-size">渐进式切片读取起始大小</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.vfsReadChunkSize"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="64M">64 MB (推荐)</option>
                      <option value="32M">32 MB</option>
                      <option value="128M">128 MB (原生)</option>
                      <option value="0">0 (关闭切片)</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--vfs-read-chunk-size-limit">切片翻倍上限</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.vfsReadChunkSizeLimit"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="1G">1 GB (推荐)</option>
                      <option value="2G">2 GB</option>
                      <option value="off">无上限 (off)</option>
                    </select>
                  </div>

                  <div class="adv-field-toggle">
                    <div class="toggle-info">
                      <span class="adv-toggle-label" title="--drive-pacer-min-sleep 10ms --drive-pacer-burst 200">Google Drive Pacer 节流调优</span>
                      <span class="adv-toggle-desc">将 API 间隔缩减至 10ms、突发量提升至 200，突破 Google Drive 默认 API 频率限制</span>
                    </div>
                    <button
                      type="button"
                      class="toggle-switch-sm"
                      :class="{ active: remoteConfigs[remote.name].mountOptions.enableDrivePacer }"
                      @click="remoteConfigs[remote.name].mountOptions.enableDrivePacer = !remoteConfigs[remote.name].mountOptions.enableDrivePacer; onCustomMountOptionChange(remote.name)"
                    >
                      <span class="toggle-slider-sm"></span>
                    </button>
                  </div>
                </div>

                <!-- 3. 后台非阻塞预热与高级 Flags -->
                <div class="adv-section-title">3. 后台预热与高级参数</div>
                <div class="adv-grid">
                  <div class="adv-field-toggle">
                    <div class="toggle-info">
                      <span class="adv-toggle-label">挂载后后台自动预热 (Warm-up)</span>
                      <span class="adv-toggle-desc">挂载就绪后在后台自动非阻塞运行 vfs/refresh recursive=true，预先创建缓存避免初次点入文件夹等待</span>
                    </div>
                    <button
                      type="button"
                      class="toggle-switch-sm"
                      :class="{ active: remoteConfigs[remote.name].mountOptions.warmUp }"
                      @click="remoteConfigs[remote.name].mountOptions.warmUp = !remoteConfigs[remote.name].mountOptions.warmUp; onCustomMountOptionChange(remote.name)"
                    >
                      <span class="toggle-slider-sm"></span>
                    </button>
                  </div>

                  <div class="adv-field adv-field-full">
                    <label class="adv-label">自定义额外 Rclone 命令行参数 (CLI Flags)</label>
                    <input
                      type="text"
                      v-model="remoteConfigs[remote.name].mountOptions.extraFlags"
                      @input="onCustomMountOptionChange(remote.name)"
                      class="adv-input"
                      placeholder="例如: --transfers 8 --buffer-size 32M"
                    />
                  </div>
                </div>

                <div class="adv-panel-footer">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="applyPresetToRemote(remote.name, 'fast')"
                  >
                    <Zap class="btn-icon" />
                    <span>重置为极速推荐值</span>
                  </button>
                </div>
              </div>

              <!-- Mounted Status Badge -->
              <div class="mounted-perf-badge" v-if="remote.is_mounted">
                <Zap class="perf-badge-icon" />
                <span>挂载性能：{{ (remoteConfigs[remote.name]?.mountPreset || 'fast') === 'fast' ? '⚡ 极速推荐 (72h 缓存 + 后台预热)' : remoteConfigs[remote.name]?.mountPreset === 'default' ? '⚖️ 官方平衡' : '🛠️ 自定义高级' }}</span>
              </div>

              <div class="checkbox-row" @click="toggleRemoteAutoMount(remote.name)">
                <div class="custom-checkbox" :class="{ checked: remoteConfigs[remote.name]?.autoMount }">
                  <Check v-if="remoteConfigs[remote.name]?.autoMount" class="check-icon" />
                </div>
                <span class="checkbox-label">开机自动挂载此磁盘</span>
              </div>
            </div>

            <!-- Card Footer -->
            <div class="card-footer">
              <template v-if="remote.is_mounted">
                <button
                  class="btn btn-emerald"
                  @click="openExplorer(remote.mounted_drive)"
                  title="打开磁盘"
                >
                  <FolderOpen class="btn-icon" />
                  <span>打开资源管理器</span>
                </button>

                <button
                  class="btn btn-cache-refresh"
                  @click="vfsRefreshCache(remote.name)"
                  :disabled="refreshingCacheRemotes.has(remote.name)"
                  title="强制刷新 VFS 目录缓存，让添加/删除的文件立即出现在磁盘中"
                >
                  <FolderSync class="btn-icon" :class="{ 'spin-anim': refreshingCacheRemotes.has(remote.name) }" />
                  <span>{{ refreshingCacheRemotes.has(remote.name) ? '刷新中...' : '刷新缓存' }}</span>
                </button>

                <button
                  class="btn btn-danger"
                  @click="unmountDrive(remote.name)"
                  :disabled="loadingRemotes.has(remote.name)"
                  title="卸载此磁盘"
                >
                  <Power class="btn-icon" />
                  <span>{{ loadingRemotes.has(remote.name) ? '正在卸载...' : '卸载' }}</span>
                </button>
              </template>

              <template v-else>
                <button
                  class="btn btn-mount-primary"
                  @click="mountDrive(remote.name)"
                  :disabled="loadingRemotes.has(remote.name) || isPrerequisiteMissing"
                >
                  <Disc3 class="btn-icon" :class="{ 'spin-anim': loadingRemotes.has(remote.name) }" />
                  <span>{{ loadingRemotes.has(remote.name) ? '正在挂载...' : '立即挂载' }}</span>
                </button>
              </template>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="empty-state">
          <div class="empty-icon-box">
            <Cloud class="empty-icon" />
          </div>
          <h2>尚未设置任何云端空间</h2>
          <p>点击下方按钮直接通过图形化引导添加您的第一个 Google Drive、OneDrive 或 WebDAV。</p>
          <button class="btn btn-primary btn-lg" @click="showAddRemoteModal = true">
            <PlusCircle class="btn-icon" />
            <span>添加云端硬盘</span>
          </button>
        </div>
      </section>

      <!-- TAB 2: SYNC & COMPARE (RcloneView Plus) -->
      <section v-if="activeTab === 'sync'" class="tab-pane">
        <div class="sub-bar">
          <div class="sub-title-group">
            <h2>文件同步与差异比对 (RcloneView Plus)</h2>
            <p>设置来源与目的路径，运行双向内容比对，支持状态筛选 (Display Filter)、单文件拷贝、选择传输与定时调度</p>
          </div>
        </div>

        <!-- Upper: Task Setup Card (上下排列之上方卡片) -->
        <div class="glass-card setup-card-compact">
          <div class="setup-compact-header">
            <div class="setup-compact-title">
              <FolderSync class="card-title-icon" />
              <span>任务路径与参数设置</span>
            </div>
            <div class="setup-compact-actions">
              <button
                class="btn btn-secondary"
                @click="handleCheckDiff"
                :disabled="syncForm.isChecking || syncForm.isRunning || isPrerequisiteMissing"
              >
                <FileCheck class="btn-icon" :class="{ 'spin-anim': syncForm.isChecking }" />
                <span>{{ syncForm.isChecking ? '比对中...' : '🔍 比对两端差异 (Check Diff)' }}</span>
              </button>

              <button
                class="btn btn-primary"
                @click="handleRunSync"
                :disabled="syncForm.isRunning || syncForm.isChecking || isPrerequisiteMissing"
              >
                <Play class="btn-icon" :class="{ 'spin-anim': syncForm.isRunning }" />
                <span>{{ syncForm.isRunning ? '运行中...' : '⚡ 立即开始同步/备份' }}</span>
              </button>

              <button
                class="btn btn-schedule"
                @click="openScheduleFromSync"
                :disabled="!syncForm.source || !syncForm.dest"
                title="直接将此任务设置保存为后台定时调度"
              >
                <CalendarClock class="btn-icon" />
                <span>🕒 直接加入调度任务</span>
              </button>
            </div>
          </div>

          <!-- Path Inputs Row -->
          <div class="setup-inputs-grid">
            <!-- Source Input -->
            <div class="form-group-compact">
              <div class="field-label-row">
                <label class="field-label">来源路径 (Source)</label>
                <div class="quick-links-group" v-if="remotes.length > 0">
                  <span class="quick-link-label">快速云端:</span>
                  <button
                    v-for="r in remotes.slice(0, 3)"
                    :key="r.name"
                    class="btn-tag"
                    @click="pickRemoteDirect(r.name, 'source')"
                    :title="`将来源设置为 ${r.name}:`"
                  >
                    {{ r.name }}:
                  </button>
                </div>
              </div>
              <div class="input-with-actions">
                <input
                  type="text"
                  v-model="syncForm.source"
                  class="modal-input"
                  placeholder="例如：C:\同步文件夹 或 GDrive:Documents"
                />
                <button
                  class="btn btn-browse"
                  @click="pickLocalFolder('source')"
                  title="从本机资源管理器浏览选择文件夹"
                >
                  <FolderOpen class="btn-icon" />
                  <span>浏览本机</span>
                </button>
                <button
                  class="btn btn-browse-cloud"
                  @click="openCloudBrowseModal('source')"
                  title="选择并深入浏览已创建的云端硬盘目录"
                >
                  <Cloud class="btn-icon" />
                  <span>选择云端</span>
                </button>
              </div>
            </div>

            <!-- Destination Column (Right Column: Primary + Extras + Add Button) -->
            <div class="destinations-col">
              <!-- Destination Input (Primary) -->
              <div class="form-group-compact">
                <div class="field-label-row">
                  <div class="dest-label-with-tag">
                    <label class="field-label">目的路径 1 (主要 Destination)</label>
                    <span class="badge-tag">主要</span>
                  </div>
                  <div class="quick-links-group" v-if="remotes.length > 0">
                    <span class="quick-link-label">快速云端:</span>
                    <button
                      v-for="r in remotes.slice(0, 3)"
                      :key="r.name"
                      class="btn-tag"
                      @click="pickRemoteDirect(r.name, 'dest')"
                      :title="`将目的设置为 ${r.name}:`"
                    >
                      {{ r.name }}:
                    </button>
                  </div>
                </div>
                <div class="input-with-actions">
                  <input
                    type="text"
                    v-model="syncForm.dest"
                    class="modal-input"
                    placeholder="例如：D:\Backup 或 GDrive:Backup"
                  />
                  <button
                    class="btn btn-browse"
                    @click="pickLocalFolder('dest')"
                    title="从本机资源管理器浏览选择文件夹"
                  >
                    <FolderOpen class="btn-icon" />
                    <span>浏览本机</span>
                  </button>
                  <button
                    class="btn btn-browse-cloud"
                    @click="openCloudBrowseModal('dest')"
                    title="选择并深入浏览已创建的云端硬盘目录"
                  >
                    <Cloud class="btn-icon" />
                    <span>选择云端</span>
                  </button>
                </div>
              </div>

              <!-- Extra Destinations (Multi-Destination Support) -->
              <div
                v-for="(extra, idx) in syncForm.extraDests"
                :key="extra.id"
                class="form-group-compact extra-dest-group"
              >
                <div class="field-label-row">
                  <div class="dest-label-with-tag">
                    <label class="field-label">目的路径 {{ idx + 2 }} (其他远程/本机文件夹)</label>
                    <span class="badge-tag badge-cyan">额外</span>
                  </div>
                  <div class="quick-links-group" v-if="remotes.length > 0">
                    <span class="quick-link-label">快速云端:</span>
                    <button
                      v-for="r in remotes.slice(0, 3)"
                      :key="r.name"
                      class="btn-tag"
                      @click="pickRemoteDirect(r.name, 'extraDest', idx)"
                      :title="`将此目的设置为 ${r.name}:`"
                    >
                      {{ r.name }}:
                    </button>
                  </div>
                </div>
                <div class="input-with-actions">
                  <input
                    type="text"
                    v-model="extra.path"
                    class="modal-input"
                    :placeholder="`例如：E:\\Backup 或 OneDrive:Backup${idx + 2}`"
                  />
                  <button
                    class="btn btn-browse"
                    @click="pickLocalFolder('extraDest', idx)"
                    title="从本机资源管理器浏览选择文件夹"
                  >
                    <FolderOpen class="btn-icon" />
                    <span>浏览本机</span>
                  </button>
                  <button
                    class="btn btn-browse-cloud"
                    @click="openCloudBrowseModal('extraDest', idx)"
                    title="选择并深入浏览已创建的云端硬盘目录"
                  >
                    <Cloud class="btn-icon" />
                    <span>选择云端</span>
                  </button>
                  <button
                    class="btn btn-danger-outline"
                    @click="removeExtraDestination(idx)"
                    title="移除此目的地"
                  >
                    <Trash2 class="btn-icon" />
                    <span>移除</span>
                  </button>
                </div>
              </div>

              <!-- Add Destination Button Action Row (Directly below destination inputs) -->
              <div class="add-destination-row">
                <button
                  type="button"
                  class="btn btn-add-dest"
                  @click="addExtraDestination"
                >
                  <FolderPlus class="btn-icon" />
                  <span>＋ 添加目的地 (Add Destination)</span>
                </button>
                <span class="dest-count-hint" v-if="syncForm.extraDests && syncForm.extraDests.length > 0">
                  目前共设置 {{ (syncForm.extraDests ? syncForm.extraDests.length : 0) + 1 }} 个同步目的地，运行时将依次传输至各目标位置。
                </span>
              </div>
            </div>
          </div>

          <!-- Secondary Options Row (Action, Filters, Auto-Schedule) -->
          <div class="setup-options-row">
            <div class="option-item flex-2">
              <label class="field-label-compact">任务模式</label>
              <select v-model="syncForm.action" class="modal-input-compact">
                <option value="copy">Copy (增量拷贝备份: 推荐！仅拷贝新文件/变更文件，不删除目标端文件)</option>
                <option value="sync">Sync (单向镜像同步: 目标端文件会完全与来源一致)</option>
                <option value="move">Move (移动传输: 文件成功拷贝到目标端后从来源端删除)</option>
              </select>
            </div>

            <div class="option-item flex-3">
              <label class="field-label-compact">排除过滤 (Filter / Exclude)</label>
              <input
                type="text"
                v-model="syncForm.excludeFilter"
                class="modal-input-compact"
                placeholder="例如：*.tmp, *.bak, thumbs.db, node_modules/**"
              />
            </div>

            <div class="option-item flex-2 checkbox-center" @click="syncForm.autoAddToScheduler = !syncForm.autoAddToScheduler">
              <div class="custom-checkbox" :class="{ checked: syncForm.autoAddToScheduler }">
                <Check v-if="syncForm.autoAddToScheduler" class="check-icon" />
              </div>
              <span class="checkbox-label text-cyan font-medium text-xs">
                同步成功后自动加入定时调度 (每 60 分钟)
              </span>
            </div>
          </div>
        </div>

        <!-- Lower: RcloneView Full Width Compare Card (上下排列之全宽比对查看窗口) -->
        <div class="glass-card rcloneview-main-card">
          <!-- Top Header: Compare Status & Reload -->
          <div class="rcloneview-header">
            <div class="rcloneview-title-group">
              <h3 class="rcloneview-title">Compare (比对查看窗口)</h3>
              <span v-if="syncForm.diffResult" class="rcloneview-count-badge">
                All data retrieved ({{ syncForm.diffResult.items ? syncForm.diffResult.items.length : 0 }} / {{ syncForm.diffResult.items ? syncForm.diffResult.items.length : 0 }} compared)
              </span>
            </div>
            <div class="rcloneview-header-right">
              <button
                v-if="syncForm.diffResult"
                class="btn btn-xs btn-schedule-outline"
                @click="openScheduleFromSync"
                title="比对无误，直接将此任务创建为后台定时调度"
              >
                <CalendarClock class="btn-icon-xs" />
                <span>创建为调度任务</span>
              </button>
              <button
                class="btn btn-xs btn-outline"
                @click="handleCheckDiff"
                :disabled="syncForm.isChecking || !syncForm.source || !syncForm.dest"
                title="重新比对两端文件夹内容"
              >
                <RefreshCw class="btn-icon-xs" :class="{ 'spin-anim': syncForm.isChecking }" />
                <span>{{ syncForm.isChecking ? '比对中...' : 'Reload (重新比对)' }}</span>
              </button>
            </div>
          </div>

          <!-- RcloneView Blue Path Indicator Bar (如 RcloneView 截屏之顶部路径条) -->
          <div class="rcloneview-path-header">
            <div class="path-col path-src" :title="syncForm.source || '未设置来源路径'">
              <span class="path-star">⭐</span>
              <span class="path-name">{{ syncForm.source || '请于上方指定来源路径 (Source)' }}</span>
              <Folder class="path-icon-right" />
            </div>
            <div class="path-col path-dest" :title="syncForm.dest || '未设置目的路径'">
              <span class="path-triangle">☁️</span>
              <span class="path-name">{{ syncForm.dest || '请于上方指定目的路径 (Destination)' }}</span>
              <Folder class="path-icon-right" />
            </div>
          </div>

          <!-- RcloneView Toolbar: Display Filters, Actions, Search (如同截屏所示) -->
          <div class="rcloneview-action-toolbar">
            <!-- Display Toggles -->
            <div class="display-group">
              <span class="toolbar-label">Display:</span>
              <button
                class="rv-toggle-btn toggle-src"
                :class="{ active: syncForm.filterModes.source_only }"
                @click="toggleFilterMode('source_only')"
                title="来源独有 (待拷贝至目标端 ➡️)"
              >
                <ArrowRight class="rv-icon text-green" />
                <span>来源独有 ({{ syncForm.diffResult?.total_source_files || 0 }})</span>
              </button>

              <button
                class="rv-toggle-btn toggle-dest"
                :class="{ active: syncForm.filterModes.dest_only }"
                @click="toggleFilterMode('dest_only')"
                title="目标端多出 (⬅️)"
              >
                <ArrowLeft class="rv-icon text-blue" />
                <span>目标端多出 ({{ syncForm.diffResult?.total_dest_files || 0 }})</span>
              </button>

              <button
                class="rv-toggle-btn toggle-eq"
                :class="{ active: syncForm.filterModes.equal }"
                @click="toggleFilterMode('equal')"
                title="两端完全一致 (＝)"
              >
                <Equal class="rv-icon text-neutral" />
                <span>完全一致 ({{ syncForm.diffResult?.total_equal || 0 }})</span>
              </button>

              <button
                class="rv-toggle-btn toggle-diff"
                :class="{ active: syncForm.filterModes.different }"
                @click="toggleFilterMode('different')"
                title="文件内容或时间不同 (≠)"
              >
                <SlidersHorizontal class="rv-icon text-purple" />
                <span>内容差异 ({{ syncForm.diffResult?.total_different || 0 }})</span>
              </button>

              <button
                v-if="syncForm.diffResult?.total_error > 0"
                class="rv-toggle-btn toggle-err"
                :class="{ active: syncForm.filterModes.error }"
                @click="toggleFilterMode('error')"
                title="读取或哈希异常 (❗)"
              >
                <AlertTriangle class="rv-icon text-red" />
                <span>异常 ({{ syncForm.diffResult?.total_error || 0 }})</span>
              </button>
            </div>

            <!-- Middle Batch Actions (Copy Selected) -->
            <div class="actions-group">
              <button
                class="btn btn-sm btn-emerald"
                @click="handleCopySelected"
                :disabled="syncForm.selectedItems.size === 0 || syncForm.isCopyingSelected"
                title="将勾选的文件从来源拷贝到目标端"
              >
                <Copy class="btn-icon-xs" />
                <span>Copy ➡️ ({{ syncForm.selectedItems.size }})</span>
              </button>
            </div>

            <!-- Right: Search Filter -->
            <div class="search-group ml-auto">
              <div class="rv-search-box">
                <Search class="rv-search-icon" />
                <input
                  type="text"
                  v-model="syncForm.searchKeyword"
                  class="rv-search-input"
                  placeholder="Find Folder/File..."
                />
              </div>
            </div>
          </div>

          <!-- RcloneView Classical Two-Column Table -->
          <div class="rcloneview-table-container">
            <table class="rv-table">
              <thead>
                <tr class="rv-thead-row">
                  <!-- Source Side Headers -->
                  <th class="col-chk">
                    <input
                      type="checkbox"
                      @change="toggleSelectAllVisible"
                      :checked="filteredDiffItems.length > 0 && filteredDiffItems.every(i => syncForm.selectedItems.has(i.path))"
                      title="全选 / 取消全选可见项目"
                    />
                  </th>
                  <th class="col-src-name">Name (来源端)</th>
                  <th class="col-src-size">Size</th>
                  <th class="col-src-date">Date Modified</th>

                  <!-- Center Direction Indicator Header -->
                  <th class="col-dir">Dir</th>

                  <!-- Destination Side Headers -->
                  <th class="col-dst-name">Name (目标端)</th>
                  <th class="col-dst-size">Size</th>
                  <th class="col-dst-date">Date Modified</th>

                  <!-- Quick Action Header -->
                  <th class="col-act">操作</th>
                </tr>
              </thead>

              <!-- Diff Items List -->
              <tbody v-if="syncForm.diffResult && filteredDiffItems.length > 0">
                <tr
                  v-for="item in filteredDiffItems"
                  :key="item.path"
                  class="rv-row"
                  :class="{
                    'rv-row-selected': syncForm.selectedItems.has(item.path),
                    'status-src-only': item.status === 'source_only',
                    'status-dst-only': item.status === 'dest_only',
                    'status-diff': item.status === 'different',
                    'status-equal': item.status === 'equal'
                  }"
                  @click="toggleItemSelect(item.path)"
                >
                  <!-- Checkbox -->
                  <td class="col-chk" @click.stop>
                    <input
                      type="checkbox"
                      :checked="syncForm.selectedItems.has(item.path)"
                      @change="toggleItemSelect(item.path)"
                    />
                  </td>

                  <!-- Source: Name -->
                  <td class="col-src-name">
                    <div class="rv-file-entry" :class="{ 'entry-empty': item.status === 'dest_only' }">
                      <Folder v-if="item.path.endsWith('/')" class="entry-icon text-amber" />
                      <span class="entry-name" :title="item.path">{{ item.path }}</span>
                    </div>
                  </td>

                  <!-- Source: Size -->
                  <td class="col-src-size">
                    <span v-if="item.size_src">{{ item.size_src }}</span>
                    <span v-else class="text-muted">-</span>
                  </td>

                  <!-- Source: Date Modified -->
                  <td class="col-src-date">
                    <span v-if="item.mtime_src">{{ item.mtime_src }}</span>
                    <span v-else class="text-muted">-</span>
                  </td>

                  <!-- Center: Direction Symbol (like RcloneView middle icons) -->
                  <td class="col-dir" @click.stop>
                    <div class="dir-icon-badge" :class="item.status">
                      <ArrowRight v-if="item.status === 'source_only'" class="dir-icon text-green" title="来源独有，待拷贝到目标端 ➡️" />
                      <ArrowLeft v-else-if="item.status === 'dest_only'" class="dir-icon text-blue" title="目标端多出 ⬅️" />
                      <SlidersHorizontal v-else-if="item.status === 'different'" class="dir-icon text-purple" title="两端内容或时间差异 ≠" />
                      <Equal v-else-if="item.status === 'equal'" class="dir-icon text-neutral" title="两端完全一致 ＝" />
                      <AlertTriangle v-else class="dir-icon text-red" title="异常 ❗" />
                    </div>
                  </td>

                  <!-- Dest: Name -->
                  <td class="col-dst-name">
                    <div class="rv-file-entry" :class="{ 'entry-empty': item.status === 'source_only' }">
                      <span v-if="item.status === 'source_only'" class="entry-placeholder">(目标端尚不存在此文件)</span>
                      <template v-else>
                        <Folder v-if="item.path.endsWith('/')" class="entry-icon text-amber" />
                        <span class="entry-name" :title="item.path">{{ item.path }}</span>
                      </template>
                    </div>
                  </td>

                  <!-- Dest: Size -->
                  <td class="col-dst-size">
                    <span v-if="item.size_dest">{{ item.size_dest }}</span>
                    <span v-else class="text-muted">-</span>
                  </td>

                  <!-- Dest: Date Modified -->
                  <td class="col-dst-date">
                    <span v-if="item.mtime_dest">{{ item.mtime_dest }}</span>
                    <span v-else class="text-muted">-</span>
                  </td>

                  <!-- Quick Action Button -->
                  <td class="col-act" @click.stop>
                    <button
                      v-if="item.status === 'source_only' || item.status === 'different'"
                      class="btn-row-action"
                      @click="handleCopySingleFile(item.path)"
                      :disabled="syncForm.isCopyingSelected"
                      title="单独拷贝此文件至目标端"
                    >
                      <span>拷贝 ➡️</span>
                    </button>
                  </td>
                </tr>
              </tbody>

              <!-- Empty state inside Diff Table -->
              <tbody v-else-if="syncForm.diffResult && filteredDiffItems.length === 0">
                <tr>
                  <td colspan="9" class="rv-empty-cell">
                    <div class="rv-empty-box">
                      <CheckCircle2 class="empty-icon text-emerald" />
                      <span>在目前筛选条件下没有符合的项目（请尝试打开其他 Display 筛选按钮或清除搜索条件）</span>
                    </div>
                  </td>
                </tr>
              </tbody>

              <!-- Empty state before diff execution -->
              <tbody v-else>
                <tr>
                  <td colspan="9" class="rv-empty-cell placeholder-height">
                    <div class="rv-empty-box">
                      <FileCheck class="empty-placeholder-icon text-cyan" />
                      <h4>尚未运行差异比对</h4>
                      <p>请设置好上方来源与目的路径后，点击上方「🔍 比对两端差异 (Check Diff)」按钮</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- RcloneView Classical Status Bar (如截屏底部之统计列) -->
          <div class="rcloneview-statusbar">
            <div class="status-left">
              <span>来源项目: {{ syncForm.diffResult?.total_source_files || 0 }} 待同步</span>
            </div>
            <div class="status-center">
              <span class="selected-count-tag">
                {{ syncForm.selectedItems.size }} item(s) selected.
              </span>
            </div>
            <div class="status-right">
              <span>目标端多出: {{ syncForm.diffResult?.total_dest_files || 0 }} 个</span>
            </div>
          </div>

          <!-- Collapsible Task Log Drawer -->
          <details class="task-log-details" :open="Boolean(syncForm.taskLog)">
            <summary class="log-summary">
              <span>实时运行记录与日志</span>
              <span class="log-summary-hint">{{ syncForm.isRunning ? '（任务正在运行中...）' : '' }}</span>
            </summary>
            <pre class="log-content-pre">{{ syncForm.taskLog || '尚未运行任务，点击「立即开始同步/备份」或「Copy ➡️」即可查看进度。' }}</pre>
          </details>
        </div>
      </section>

      <!-- TAB 3: SCHEDULER -->
      <section v-if="activeTab === 'scheduler'" class="tab-pane">
        <div class="sub-bar">
          <div class="sub-title-group">
            <h2>后台定时调度任务</h2>
            <p>即使关闭窗口，只要程序常驻在右下角 System Tray，调度就会在后台自动运行</p>
          </div>
          <button class="btn btn-primary" @click="showAddTaskModal = true">
            <PlusCircle class="btn-icon" />
            <span>添加调度任务</span>
          </button>
        </div>

        <div v-if="scheduledTasks.length > 0" class="task-table-wrapper">
          <table class="task-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>任务名称</th>
                <th>来源路径</th>
                <th>目的路径</th>
                <th>模式</th>
                <th>运行频率</th>
                <th>上次运行</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in scheduledTasks" :key="task.id">
                <td>
                  <span class="status-pill" :class="task.enabled ? 'pill-active' : 'pill-disabled'">
                    {{ task.enabled ? (task.status || '待命') : '已禁用' }}
                  </span>
                </td>
                <td class="font-bold">{{ task.name }}</td>
                <td class="font-mono text-cyan">{{ task.source }}</td>
                <td class="font-mono text-emerald">{{ task.dest }}</td>
                <td>{{ task.action.toUpperCase() }}</td>
                <td>每隔 {{ task.intervalMinutes }} 分钟</td>
                <td>{{ task.lastRun || '从未运行' }}</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="executeTaskNow(task)"
                      :disabled="task.status === '运行中...'"
                      title="立即运行一次此调度任务"
                    >
                      <Play class="btn-icon" />
                      <span>运行</span>
                    </button>
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="openEditTaskModal(task)"
                      title="修改调度任务设置"
                    >
                      <Pencil class="btn-icon" />
                      <span>修改</span>
                    </button>
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="toggleTaskEnabled(task)"
                      :title="task.enabled ? '暂停定时调度' : '启用定时调度'"
                    >
                      {{ task.enabled ? '禁用' : '启用' }}
                    </button>
                    <button
                      class="btn btn-danger btn-sm"
                      @click="removeTask(task.id)"
                      title="删除此调度任务"
                    >
                      <Trash2 class="btn-icon" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          <div class="empty-icon-box">
            <CalendarClock class="empty-icon" />
          </div>
          <h2>目前没有任何定时调度任务</h2>
          <p>设置定时备份任务，自动在后台把文件夹同步至 Google Drive、OneDrive 或 NAS。</p>
          <button class="btn btn-primary" @click="showAddTaskModal = true">
            <PlusCircle class="btn-icon" />
            <span>创建第一个调度任务</span>
          </button>
        </div>
      </section>

      <!-- TAB 4: WEB-GUI -->
      <section v-if="activeTab === 'webgui'" class="tab-pane">
        <div class="sub-bar">
          <div class="sub-title-group">
            <h2>Rclone 官方原生 Web-GUI</h2>
            <p>通过内置 Web 服务器提供官方完整版管理界面（资源管理器、图形仪表盘）</p>
          </div>
          <div class="sub-actions">
            <button
              class="btn"
              :class="envStatus.webgui_running ? 'btn-danger' : 'btn-primary'"
              @click="toggleWebGui"
            >
              <Power class="btn-icon" />
              <span>{{ envStatus.webgui_running ? '停止 Web-GUI 服务' : '启动 Web-GUI 服务' }}</span>
            </button>

            <button class="btn btn-emerald" @click="openWebGuiInBrowser">
              <ExternalLink class="btn-icon" />
              <span>以默认浏览器打开 (http://127.0.0.1:5572)</span>
            </button>
          </div>
        </div>

        <!-- Embedded Web-GUI Frame -->
        <div class="webgui-frame-box">
          <iframe
            v-if="envStatus.webgui_running"
            src="http://127.0.0.1:5572/"
            class="webgui-iframe"
          ></iframe>
          <div v-else class="webgui-placeholder">
            <Globe class="placeholder-icon" />
            <h3>Web-GUI 服务尚未启动</h3>
            <p>点击上方「启动 Web-GUI 服务」即可在此内嵌或通过浏览器进行操作。</p>
            <button class="btn btn-primary btn-lg" @click="toggleWebGui">
              <Power class="btn-icon" />
              <span>立即启动 Web-GUI 服务器</span>
            </button>
          </div>
        </div>
      </section>
    </main>

    <!-- MODAL: ADD REMOTE (GUI WIZARD) -->
    <div v-if="showAddRemoteModal" class="modal-backdrop" @click.self="showAddRemoteModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <PlusCircle class="modal-title-icon" />
            <span>添加云端硬盘连接 (图形向导)</span>
          </div>
          <div class="modal-header-actions">
            <button
              class="btn btn-secondary btn-sm"
              @click="handleOpenRcloneTerminal"
              title="打开 Windows 命令提示符运行 rclone config 原版交互设置"
            >
              <Terminal class="btn-icon" />
              <span>原版终端向导 (rclone config)</span>
            </button>
            <button class="close-btn" @click="showAddRemoteModal = false">
              <X class="close-icon" />
            </button>
          </div>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">云端硬盘名称 (Remote Name)</label>
            <input
              type="text"
              v-model="newRemoteForm.name"
              class="modal-input"
              placeholder="例如：MyGoogleDrive, MyS3Storage, HomeNAS"
            />
            <span class="field-hint">供本机识别与挂载的唯一名称，不可包含特殊字符。</span>
          </div>

          <div class="setting-group">
            <div class="flex-between mb-1">
              <label class="group-title">云端服务类型 (Storage Provider)</label>
              <span class="text-xs text-muted">原版支持 60+ 种云端服务</span>
            </div>
            <!-- Provider Filter / Search -->
            <div class="search-input-wrapper mb-2">
              <Search class="search-icon" />
              <input
                type="text"
                v-model="newRemoteForm.searchProvider"
                class="modal-input search-input"
                placeholder="快速过滤云端服务（例如：s3, drive, webdav, smb, b2...）"
              />
              <button
                v-if="newRemoteForm.searchProvider"
                class="search-clear-btn"
                @click="newRemoteForm.searchProvider = ''"
              >
                <X class="clear-icon" />
              </button>
            </div>

            <select v-model="newRemoteForm.type" class="modal-input">
              <optgroup
                v-for="cat in filteredStorageCategories"
                :key="cat.category"
                :label="cat.category"
              >
                <option v-for="it in cat.items" :key="it.type" :value="it.type">
                  {{ it.name }}
                </option>
              </optgroup>
              <optgroup
                v-if="allOtherRcloneProviders.length > 0"
                :label="'更多 Rclone 原版存储提供商 (' + allOtherRcloneProviders.length + ' 种)'"
              >
                <option v-for="p in allOtherRcloneProviders" :key="p.Prefix" :value="p.Prefix">
                  {{ p.Description || p.Name }} ({{ p.Prefix }})
                </option>
              </optgroup>
            </select>
          </div>

          <!-- OAuth Notice for Google Drive / OneDrive / Dropbox / Box / pCloud / Yandex -->
          <div v-if="isOAuthType(newRemoteForm.type)" class="info-box">
            <div class="info-title">
              <Info class="info-icon text-cyan" />
              <span class="text-cyan font-bold">浏览器 OAuth 授权登录</span>
            </div>
            <p class="group-desc">
              点击下方「立即创建」后，系统将自动于您的默认浏览器中打开官方登录授权页面。<br />
              在浏览器登录授权成功后即完成连接，完全无需繁琐设置！
            </p>
            <!-- Optional Advanced OAuth Client ID / Secret -->
            <details class="advanced-details mt-2">
              <summary class="advanced-summary">高级自定义 Client ID / Secret (选填)</summary>
              <div class="setting-group mt-2">
                <input
                  type="text"
                  v-model="newRemoteForm.clientId"
                  class="modal-input"
                  placeholder="自定义 Client ID (留空使用官方默认)"
                />
                <input
                  type="password"
                  v-model="newRemoteForm.clientSecret"
                  class="modal-input mt-2"
                  placeholder="自定义 Client Secret (留空使用官方默认)"
                />
              </div>
            </details>
          </div>

          <!-- S3 / S3-Compatible Object Storage Inputs -->
          <template v-if="newRemoteForm.type === 's3'">
            <!-- S3 Key Auth Explanation Alert -->
            <div class="info-box s3-alert">
              <div class="info-title">
                <ShieldCheck class="info-icon text-amber" />
                <span class="font-bold text-amber">AWS S3 / 对象存储认证说明 (密钥直连)</span>
              </div>
              <p class="group-desc">
                💡 <b>S3 采用密钥直接认证</b>：S3 与兼容云端服务通过 API 的 <code>Access Key ID</code> 与 <code>Secret Access Key</code> 进行授权，创建时<b>不会也不需要打开浏览器跳转页面</b>！请填写下方密钥后点击「立即创建」即可连接。<br/>
                若您使用的是 AWS SSO、IAM Identity Center 或需引导式问答，可点击右上角「⚡ 原版终端向导」。
              </p>
            </div>

            <div class="setting-group">
              <label class="group-title">S3 存储子类型 (S3 Provider)</label>
              <select
                :value="newRemoteForm.s3Provider"
                @change="onS3ProviderSelect(newRemoteForm, $event.target.value)"
                class="modal-input"
              >
                <option v-for="sp in S3_PROVIDERS" :key="sp.value" :value="sp.value">
                  {{ sp.label }}
                </option>
              </select>
            </div>

            <div class="setting-group">
              <label class="group-title">访问密钥 ID (Access Key ID)</label>
              <input
                type="text"
                v-model="newRemoteForm.s3AccessKey"
                class="modal-input font-mono"
                placeholder="例如：AKIAIOSFODNN7EXAMPLE"
              />
            </div>

            <div class="setting-group">
              <label class="group-title">私密密钥 (Secret Access Key)</label>
              <div class="password-wrapper">
                <input
                  :type="newRemoteForm.showSecretKey ? 'text' : 'password'"
                  v-model="newRemoteForm.s3SecretKey"
                  class="modal-input font-mono pr-10"
                  placeholder="例如：wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                />
                <button
                  type="button"
                  class="toggle-eye-btn"
                  @click="newRemoteForm.showSecretKey = !newRemoteForm.showSecretKey"
                  :title="newRemoteForm.showSecretKey ? '隐藏密钥' : '显示密钥'"
                >
                  <EyeOff v-if="newRemoteForm.showSecretKey" class="eye-icon" />
                  <Eye v-else class="eye-icon" />
                </button>
              </div>
            </div>

            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">服务区域 (Region)</label>
                <input
                  type="text"
                  v-model="newRemoteForm.s3Region"
                  class="modal-input font-mono"
                  placeholder="例如：us-east-1, ap-northeast-1, auto"
                />
              </div>

              <div class="setting-group">
                <label class="group-title">端点网址 (Endpoint URL)</label>
                <input
                  type="text"
                  v-model="newRemoteForm.s3Endpoint"
                  class="modal-input font-mono"
                  placeholder="AWS 官方可留空；自建或 Cloudflare R2 请输入完整网址"
                />
              </div>
            </div>

            <!-- S3 Advanced Options -->
            <details class="advanced-details mt-2">
              <summary class="advanced-summary">高级 S3 选项 (路径样式 / IAM)</summary>
              <div class="setting-group mt-2">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="newRemoteForm.s3ForcePathStyle" />
                  <span>强制路径样式 (Force Path Style) — <i>MinIO、Ceph 或自建 S3 通常需勾选</i></span>
                </label>
                <label class="checkbox-label mt-1">
                  <input type="checkbox" v-model="newRemoteForm.s3EnvAuth" />
                  <span>从环境变量或 AWS IAM 角色读取凭证 (Env Auth)</span>
                </label>
              </div>
            </details>
          </template>

          <!-- WebDAV Inputs -->
          <template v-if="newRemoteForm.type === 'webdav'">
            <div class="setting-group">
              <label class="group-title">WebDAV URL</label>
              <input type="text" v-model="newRemoteForm.url" class="modal-input" placeholder="https://example.com/remote.php/webdav" />
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">用户名</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="Username" />
              </div>
              <div class="setting-group">
                <label class="group-title">密码 / 应用程序密码</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" placeholder="Password" />
              </div>
            </div>
          </template>

          <!-- SMB / Windows Shared Folder Inputs -->
          <template v-if="newRemoteForm.type === 'smb'">
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">服务器主机位置 (Host)</label>
                <input type="text" v-model="newRemoteForm.host" class="modal-input" placeholder="192.168.1.100 或 nas.local" />
              </div>
              <div class="setting-group">
                <label class="group-title">连接端口 (Port)</label>
                <input type="text" v-model="newRemoteForm.port" class="modal-input" placeholder="445" />
              </div>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">用户名 (User)</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="Username" />
              </div>
              <div class="setting-group">
                <label class="group-title">密码 (Password)</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" placeholder="Password" />
              </div>
            </div>
            <div class="setting-group">
              <label class="group-title">域名名称 (Domain，选填)</label>
              <input type="text" v-model="newRemoteForm.domain" class="modal-input" placeholder="WORKGROUP" />
            </div>
          </template>

          <!-- FTP / SFTP Inputs -->
          <template v-if="newRemoteForm.type === 'ftp' || newRemoteForm.type === 'sftp'">
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">主机位置 (Host)</label>
                <input type="text" v-model="newRemoteForm.host" class="modal-input" placeholder="192.168.1.100 或 ftp.example.com" />
              </div>
              <div class="setting-group">
                <label class="group-title">连接端口 (Port)</label>
                <input type="text" v-model="newRemoteForm.port" class="modal-input" :placeholder="newRemoteForm.type === 'sftp' ? '22' : '21'" />
              </div>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">用户账号</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="Username" />
              </div>
              <div class="setting-group">
                <label class="group-title">密码</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" placeholder="Password" />
              </div>
            </div>
          </template>

          <!-- Backblaze B2 Native API -->
          <template v-if="newRemoteForm.type === 'b2'">
            <div class="setting-group">
              <label class="group-title">Account ID / Key ID</label>
              <input type="text" v-model="newRemoteForm.account" class="modal-input font-mono" placeholder="Backblaze Account ID" />
            </div>
            <div class="setting-group">
              <label class="group-title">Application Key</label>
              <input type="password" v-model="newRemoteForm.key" class="modal-input font-mono" placeholder="Backblaze Application Key" />
            </div>
          </template>

          <!-- Azure Blob Storage -->
          <template v-if="newRemoteForm.type === 'azureblob'">
            <div class="setting-group">
              <label class="group-title">Storage Account Name</label>
              <input type="text" v-model="newRemoteForm.account" class="modal-input" placeholder="Azure Storage Account Name" />
            </div>
            <div class="setting-group">
              <label class="group-title">Storage Account Key</label>
              <input type="password" v-model="newRemoteForm.key" class="modal-input font-mono" placeholder="Azure Storage Key" />
            </div>
          </template>

          <!-- Mega / ProtonDrive -->
          <template v-if="newRemoteForm.type === 'mega' || newRemoteForm.type === 'protondrive'">
            <div class="setting-group">
              <label class="group-title">账号 (Email)</label>
              <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="your-email@example.com" />
            </div>
            <div class="setting-group">
              <label class="group-title">密码</label>
              <input type="password" v-model="newRemoteForm.pass" class="modal-input" placeholder="Password" />
            </div>
          </template>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddRemoteModal = false">取消</button>
          <button
            class="btn btn-primary"
            @click="submitAddRemote"
            :disabled="newRemoteForm.isCreating"
          >
            <Disc3 class="btn-icon" :class="{ 'spin-anim': newRemoteForm.isCreating }" />
            <span v-if="newRemoteForm.isCreating">
              {{ isOAuthType(newRemoteForm.type) ? '创建中 (请在浏览器完成授权)...' : '正在连接创建中...' }}
            </span>
            <span v-else>
              {{ isOAuthType(newRemoteForm.type) ? '🚀 立即创建 (将打开浏览器授权)' : (newRemoteForm.type === 's3' ? '🚀 立即创建 S3 连接' : '🚀 立即创建') }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: EDIT REMOTE (MODIFY CONFIGURATION) -->
    <div v-if="showEditRemoteModal" class="modal-backdrop" @click.self="showEditRemoteModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <Pencil class="modal-title-icon" />
            <span>修改云端设置: {{ editRemoteForm.newName || editRemoteForm.name }}</span>
          </div>
          <button class="close-btn" @click="showEditRemoteModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">云端硬盘名称 (Remote Name)</label>
            <input
              type="text"
              v-model="editRemoteForm.newName"
              class="modal-input font-bold"
              placeholder="例如：xVideo"
            />
            <span class="field-hint">可直接修改名称，保存后挂载盘符与设置将自动平移。</span>
          </div>

          <div class="setting-group">
            <label class="group-title">服务类型</label>
            <div class="text-cyan font-bold">{{ getProviderDetails(editRemoteForm.type).name }} ({{ editRemoteForm.type }})</div>
          </div>

          <!-- OAuth Re-authenticate for Drive / OneDrive -->
          <div v-if="editRemoteForm.type.includes('drive') || editRemoteForm.type.includes('onedrive')" class="setting-group info-box">
            <div class="info-title">
              <KeyRound class="info-icon" />
              <span>云端账号登录授权</span>
            </div>
            <p class="group-desc">
              若遇到凭证过期或无法访问，点击下方按钮即可重新在默认浏览器中进行 OAuth 账号登录授权。
            </p>
            <button
              class="btn btn-emerald mt-2"
              @click="handleReconnectRemote"
              :disabled="editRemoteForm.isReconnecting"
            >
              <RotateCw class="btn-icon" :class="{ 'spin-anim': editRemoteForm.isReconnecting }" />
              <span>{{ editRemoteForm.isReconnecting ? '正在打开浏览器授权...' : '重新前往浏览器登录授权' }}</span>
            </button>
          </div>

          <!-- S3 Edit -->
          <template v-if="editRemoteForm.type.includes('s3')">
            <div class="setting-group">
              <label class="group-title">S3 存储子类型 (S3 Provider)</label>
              <select
                :value="editRemoteForm.s3Provider"
                @change="onS3ProviderSelect(editRemoteForm, $event.target.value)"
                class="modal-input"
              >
                <option v-for="sp in S3_PROVIDERS" :key="sp.value" :value="sp.value">
                  {{ sp.label }}
                </option>
              </select>
            </div>
            <div class="setting-group">
              <label class="group-title">访问密钥 ID (Access Key ID)</label>
              <input type="text" v-model="editRemoteForm.s3AccessKey" class="modal-input font-mono" placeholder="Access Key ID" />
            </div>
            <div class="setting-group">
              <label class="group-title">私密密钥 (Secret Access Key)</label>
              <div class="password-wrapper">
                <input
                  :type="editRemoteForm.showSecretKey ? 'text' : 'password'"
                  v-model="editRemoteForm.s3SecretKey"
                  class="modal-input font-mono pr-10"
                  placeholder="留空代表不变更密钥"
                />
                <button
                  type="button"
                  class="toggle-eye-btn"
                  @click="editRemoteForm.showSecretKey = !editRemoteForm.showSecretKey"
                >
                  <EyeOff v-if="editRemoteForm.showSecretKey" class="eye-icon" />
                  <Eye v-else class="eye-icon" />
                </button>
              </div>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">服务区域 (Region)</label>
                <input type="text" v-model="editRemoteForm.s3Region" class="modal-input font-mono" placeholder="例如：us-east-1" />
              </div>
              <div class="setting-group">
                <label class="group-title">端点网址 (Endpoint URL)</label>
                <input type="text" v-model="editRemoteForm.s3Endpoint" class="modal-input font-mono" placeholder="自定义端点" />
              </div>
            </div>
            <details class="advanced-details mt-2">
              <summary class="advanced-summary">高级 S3 选项</summary>
              <div class="setting-group mt-2">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editRemoteForm.s3ForcePathStyle" />
                  <span>强制路径样式 (Force Path Style)</span>
                </label>
                <label class="checkbox-label mt-1">
                  <input type="checkbox" v-model="editRemoteForm.s3EnvAuth" />
                  <span>从环境变量或 IAM 读取凭证 (Env Auth)</span>
                </label>
              </div>
            </details>
          </template>

          <!-- WebDAV Edit -->
          <template v-if="editRemoteForm.type === 'webdav'">
            <div class="setting-group">
              <label class="group-title">WebDAV URL</label>
              <input type="text" v-model="editRemoteForm.url" class="modal-input" />
            </div>
            <div class="setting-group">
              <label class="group-title">用户名</label>
              <input type="text" v-model="editRemoteForm.user" class="modal-input" />
            </div>
            <div class="setting-group">
              <label class="group-title">新密码 (若不修改请留空)</label>
              <input type="password" v-model="editRemoteForm.pass" class="modal-input" placeholder="留空代表不变更密码" />
            </div>
          </template>

          <!-- SMB Edit -->
          <template v-if="editRemoteForm.type === 'smb'">
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">主机位置 (Host)</label>
                <input type="text" v-model="editRemoteForm.host" class="modal-input" />
              </div>
              <div class="setting-group">
                <label class="group-title">连接端口 (Port)</label>
                <input type="text" v-model="editRemoteForm.port" class="modal-input" placeholder="445" />
              </div>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">用户账号</label>
                <input type="text" v-model="editRemoteForm.user" class="modal-input" />
              </div>
              <div class="setting-group">
                <label class="group-title">新密码 (若不修改请留空)</label>
                <input type="password" v-model="editRemoteForm.pass" class="modal-input" placeholder="留空代表不变更密码" />
              </div>
            </div>
            <div class="setting-group">
              <label class="group-title">域名名称 (Domain)</label>
              <input type="text" v-model="editRemoteForm.domain" class="modal-input" />
            </div>
          </template>

          <!-- FTP / SFTP Edit -->
          <template v-if="editRemoteForm.type === 'ftp' || editRemoteForm.type === 'sftp'">
            <div class="setting-group">
              <label class="group-title">主机位置 (Host)</label>
              <input type="text" v-model="editRemoteForm.host" class="modal-input" />
            </div>
            <div class="setting-group" v-if="editRemoteForm.type === 'ftp'">
              <label class="group-title">连接端口 (Port)</label>
              <input type="text" v-model="editRemoteForm.port" class="modal-input" />
            </div>
            <div class="setting-group">
              <label class="group-title">用户账号</label>
              <input type="text" v-model="editRemoteForm.user" class="modal-input" />
            </div>
            <div class="setting-group">
              <label class="group-title">新密码 (若不修改请留空)</label>
              <input type="password" v-model="editRemoteForm.pass" class="modal-input" placeholder="留空代表不变更密码" />
            </div>
          </template>

          <!-- Optional Client ID / Secret for Advanced Users -->
          <div v-if="editRemoteForm.type.includes('drive') || editRemoteForm.type.includes('onedrive')" class="setting-group">
            <label class="group-title">自定义 Client ID (选填)</label>
            <input
              type="text"
              v-model="editRemoteForm.clientId"
              class="modal-input"
              :placeholder="editRemoteForm.type.includes('onedrive') ? '自定义 Microsoft / Azure Client ID' : '自定义 Google API Client ID'"
            />
            <label class="group-title mt-2">自定义 Client Secret (选填)</label>
            <input
              type="password"
              v-model="editRemoteForm.clientSecret"
              class="modal-input"
              :placeholder="editRemoteForm.type.includes('onedrive') ? '自定义 Microsoft / Azure Client Secret' : '自定义 Google API Client Secret'"
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showEditRemoteModal = false">取消</button>
          <button
            class="btn btn-primary"
            @click="submitEditRemote"
            :disabled="editRemoteForm.isSaving"
          >
            <Check class="btn-icon" />
            <span>{{ editRemoteForm.isSaving ? '保存中...' : '保存修改' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: ADD TASK (SCHEDULER) -->
    <div v-if="showAddTaskModal" class="modal-backdrop" @click.self="showAddTaskModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <CalendarClock class="modal-title-icon" />
            <span>创建定时调度同步任务</span>
          </div>
          <button class="close-btn" @click="showAddTaskModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">任务名称</label>
            <input type="text" v-model="newTask.name" class="modal-input" placeholder="例如：每日照片自动备份" />
          </div>
          <div class="setting-group">
            <label class="group-title">来源路径 (Source)</label>
            <input type="text" v-model="newTask.source" class="modal-input" placeholder="例如：D:\Photos 或 GDrive_alanytp100:Photos" />
          </div>
          <div class="setting-group">
            <label class="group-title">目的路径 (Destination)</label>
            <input type="text" v-model="newTask.dest" class="modal-input" placeholder="例如：GPhoto_alanytp100:Backup" />
          </div>
          <div class="setting-group">
            <label class="group-title">动作模式</label>
            <select v-model="newTask.action" class="modal-input">
              <option value="copy">Copy (增量备份，不删除目标端文件)</option>
              <option value="sync">Sync (完全镜像同步，目标端文件与来源一致)</option>
            </select>
          </div>
          <div class="setting-group">
            <label class="group-title">排除文件过滤规则 (选填)</label>
            <input type="text" v-model="newTask.excludeFilter" class="modal-input" placeholder="例如：*.tmp, *.bak, thumbs.db, node_modules/**" />
            <span class="field-hint">若有输入，调度运行时将自动跳过符合的文件</span>
          </div>
          <div class="setting-group">
            <label class="group-title">运行频率 (分钟)</label>
            <input type="number" v-model="newTask.intervalMinutes" class="modal-input" min="5" placeholder="60" />
            <span class="field-hint">每隔多少分钟自动运行一次 (建议 60 分钟以上)</span>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddTaskModal = false">取消</button>
          <button class="btn btn-primary" @click="submitAddTask">创建调度</button>
        </div>
      </div>
    </div>

    <!-- MODAL: EDIT TASK (SCHEDULER) -->
    <div v-if="showEditTaskModal" class="modal-backdrop" @click.self="showEditTaskModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <Pencil class="modal-title-icon" />
            <span>修改调度任务</span>
          </div>
          <button class="close-btn" @click="showEditTaskModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">任务名称</label>
            <input type="text" v-model="editTaskForm.name" class="modal-input" placeholder="例如：每日照片自动备份" />
          </div>
          <div class="setting-group">
            <label class="group-title">来源路径 (Source)</label>
            <input type="text" v-model="editTaskForm.source" class="modal-input" placeholder="例如：D:\Photos 或 GDrive_alanytp100:Photos" />
          </div>
          <div class="setting-group">
            <label class="group-title">目的路径 (Destination)</label>
            <input type="text" v-model="editTaskForm.dest" class="modal-input" placeholder="例如：GPhoto_alanytp100:Backup" />
          </div>
          <div class="setting-group">
            <label class="group-title">动作模式</label>
            <select v-model="editTaskForm.action" class="modal-input">
              <option value="copy">Copy (增量备份，不删除目标端文件)</option>
              <option value="sync">Sync (完全镜像同步，目标端文件与来源一致)</option>
            </select>
          </div>
          <div class="setting-group">
            <label class="group-title">排除文件过滤规则 (选填)</label>
            <input type="text" v-model="editTaskForm.excludeFilter" class="modal-input" placeholder="例如：*.tmp, *.bak, thumbs.db, node_modules/**" />
            <span class="field-hint">若有输入，调度运行时将自动跳过符合的文件</span>
          </div>
          <div class="setting-group">
            <label class="group-title">运行频率 (分钟)</label>
            <input type="number" v-model="editTaskForm.intervalMinutes" class="modal-input" min="1" placeholder="60" />
            <span class="field-hint">每隔多少分钟自动运行一次 (建议 60 分钟以上)</span>
          </div>
          <div class="setting-group">
            <label class="group-title">任务状态</label>
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" v-model="editTaskForm.enabled" />
              <span>启用此定时调度任务</span>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showEditTaskModal = false">取消</button>
          <button class="btn btn-primary" @click="submitEditTask">保存修改</button>
        </div>
      </div>
    </div>

    <!-- MODAL: SETTINGS -->
    <div v-if="showSettings" class="modal-backdrop" @click.self="showSettings = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <Sliders class="modal-title-icon" />
            <span>系统偏好与自定义路径</span>
          </div>
          <button class="close-btn" @click="showSettings = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">Rclone 可执行文件路径</label>
            <p class="group-desc">默认为 C:\rclone\rclone.exe</p>
            <div class="input-with-button">
              <input type="text" v-model="customRclonePath" class="modal-input" />
              <button class="btn btn-secondary" @click="saveCustomPath">保存路径</button>
            </div>
          </div>

          <div class="setting-group">
            <div class="switch-row">
              <div>
                <div class="switch-title">开机自动启动</div>
                <div class="group-desc">登录 Windows 时自动在后台启动 Rclone Drive</div>
              </div>
              <button
                class="toggle-switch"
                :class="{ active: autostartActive }"
                @click="toggleAutostart"
              >
                <span class="toggle-slider"></span>
              </button>
            </div>
          </div>

          <div class="setting-group">
            <div class="switch-row">
              <div>
                <div class="switch-title">开机启动后缩小至系统托盘 (Tray)</div>
                <div class="group-desc">开机自启动时保持在右下角通知区常驻，不主动弹出窗口</div>
              </div>
              <button
                class="toggle-switch"
                :class="{ active: startMinimizedActive }"
                @click="toggleStartMinimized"
              >
                <span class="toggle-slider"></span>
              </button>
            </div>
          </div>

          <div class="setting-group">
            <label class="group-title">默认云端挂载性能策略 (Global Mount Preset)</label>
            <p class="group-desc">新加入或未个别微调的云端硬盘挂载时，默认应用的缓存性能策略</p>
            <select
              v-model="globalMountPreset"
              @change="saveGlobalMountPreset(globalMountPreset)"
              class="modal-input"
            >
              <option value="fast">⚡ 极速推荐 (Fast: 72h 缓存, 10m 属性, 50G 磁盘缓存, 后台预热)</option>
              <option value="default">⚖️ 官方平衡 (Default: 5m 目录缓存, 1s 属性, 关闭后台预热)</option>
              <option value="custom">🛠️ 自定义高级 (Custom)</option>
            </select>
          </div>

          <div class="setting-group">
            <div class="switch-row">
              <div>
                <div class="switch-title">浅色外观主题 (Light Mode)</div>
                <div class="group-desc">切换明亮浅色或深邃暗色界面外观风格</div>
              </div>
              <button
                class="toggle-switch"
                :class="{ active: isLightMode }"
                @click="toggleTheme"
              >
                <span class="toggle-slider"></span>
              </button>
            </div>
          </div>

          <!-- GitHub Release Update Settings -->
          <div class="setting-group">
            <div class="switch-row">
              <div>
                <div class="switch-title">自动检查 GitHub 最新版本</div>
                <div class="group-desc">
                  目前版本：v{{ CURRENT_VERSION }} • 上次检查：{{ updateSettings.lastCheckTimeStr }}
                </div>
              </div>
              <button
                class="toggle-switch"
                :class="{ active: updateSettings.enabled }"
                @click="toggleUpdateEnabled"
              >
                <span class="toggle-slider"></span>
              </button>
            </div>
          </div>

          <div class="setting-group" v-if="updateSettings.enabled">
            <label class="group-title">版本检查频率</label>
            <p class="group-desc">设置后台向 GitHub Releases 自动检查新版本的间隔周期</p>
            <select
              v-model.number="updateSettings.intervalDays"
              @change="saveUpdateSettings"
              class="modal-input"
            >
              <option :value="1">每天检查一次</option>
              <option :value="3">每 3 天检查一次</option>
              <option :value="7">每周检查一次 (默认)</option>
              <option :value="14">每两周检查一次</option>
              <option :value="30">每月检查一次</option>
            </select>
          </div>

          <div class="setting-group">
            <div class="switch-row">
              <div>
                <div class="switch-title">手动检查最新版本</div>
                <div class="group-desc">实时连接 GitHub 查找是否有新版发布</div>
              </div>
              <button
                class="btn btn-secondary btn-sm"
                @click="checkForUpdates(true)"
                :disabled="isCheckingUpdate"
              >
                <RefreshCw class="btn-icon" :class="{ 'spin-anim': isCheckingUpdate }" />
                <span>{{ isCheckingUpdate ? '检查中...' : '检查更新' }}</span>
              </button>
            </div>
          </div>

          <div class="setting-group info-box">
            <div class="info-title">
              <Info class="info-icon" />
              <span>依赖组件下载信息</span>
            </div>
            <p class="group-desc">
              • <b>WinFsp 文件系统核心</b>：<a href="#" class="link" @click.prevent="openUrl('https://winfsp.dev/')">前往 winfsp.dev 下载</a><br />
              • <b>Rclone 官方最新版本</b>：<a href="#" class="link" @click.prevent="openUrl('https://rclone.org/downloads/')">前往 rclone.org 下载</a>
            </p>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showSettings = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- MODAL: CLOUD DIRECTORY BROWSER -->
    <div v-if="showCloudBrowseModal" class="modal-backdrop" @click.self="showCloudBrowseModal = false">
      <div class="modal-card cloud-browser-modal">
        <div class="modal-header">
          <div class="modal-title">
            <Cloud class="modal-title-icon text-cyan" />
            <span>选择云端硬盘目录 ({{ cloudBrowseTarget === 'source' ? '来源路径' : '目的路径' }})</span>
          </div>
          <button class="close-btn" @click="showCloudBrowseModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <!-- Remote Selector -->
          <div class="setting-group">
            <label class="group-title">选择云端远程 (Remote)</label>
            <select v-model="cloudBrowseRemote" class="modal-input" @change="cloudBrowseCurrentSubpath = ''; fetchCloudDirs()">
              <option v-for="r in remotes" :key="r.name" :value="r.name">
                {{ r.name }} ({{ r.remote_type }})
              </option>
            </select>
          </div>

          <!-- Current Path Breadcrumb -->
          <div class="cloud-breadcrumb-bar">
            <button class="btn btn-xs btn-outline" @click="goCloudParentDir" :disabled="!cloudBrowseCurrentSubpath">
              <span>⬅️ 上一层目录</span>
            </button>
            <div class="cloud-current-path" :title="`${cloudBrowseRemote}:${cloudBrowseCurrentSubpath}`">
              📁 {{ cloudBrowseRemote }}:/{{ cloudBrowseCurrentSubpath }}
            </div>
          </div>

          <!-- Directory List -->
          <div class="cloud-dirs-container">
            <div v-if="isLoadingCloudDirs" class="cloud-dirs-loading">
              <RefreshCw class="btn-icon spin-anim text-cyan" />
              <span>正在读取云端目录清单...</span>
            </div>
            <div v-else-if="cloudBrowseDirs.length === 0" class="cloud-dirs-empty">
              <span>此层无其他子文件夹（或可以直接选择此层作为路径）</span>
            </div>
            <div v-else class="cloud-dirs-list">
              <div
                v-for="d in cloudBrowseDirs"
                :key="d"
                class="cloud-dir-item"
                @dblclick="enterCloudSubdir(d)"
              >
                <Folder class="cloud-dir-icon" />
                <span class="cloud-dir-name">{{ d }}</span>
                <button class="btn btn-xs btn-outline ml-auto" @click="enterCloudSubdir(d)">
                  进入 ➔
                </button>
              </div>
            </div>
          </div>
          <span class="field-hint">可点击「进入」进入子文件夹，确认好路径后点击下方「选择此路径」即可自动带入！</span>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showCloudBrowseModal = false">取消</button>
          <button class="btn btn-primary" @click="confirmCloudBrowseSelect">
            <span>选择此路径 ({{ cloudBrowseRemote }}:{{ cloudBrowseCurrentSubpath ? '/' + cloudBrowseCurrentSubpath : '' }})</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: UPDATE AVAILABLE -->
    <div v-if="showUpdateModal" class="modal-backdrop" @click.self="showUpdateModal = false">
      <div class="modal-card update-modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <DownloadCloud class="modal-title-icon text-cyan" />
            <span>发现新版本更新 (v{{ updateInfo.latestVersion }})</span>
          </div>
          <button class="close-btn" @click="showUpdateModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="update-banner">
            <div class="update-version-tag">
              <span class="old-ver">v{{ updateInfo.currentVersion }}</span>
              <ArrowRight class="ver-arrow" />
              <span class="new-ver">v{{ updateInfo.latestVersion }}</span>
            </div>
            <div class="update-date" v-if="updateInfo.publishedAt">
              发布日期：{{ updateInfo.publishedAt }}
            </div>
          </div>

          <div class="update-release-title" v-if="updateInfo.releaseTitle">
            {{ updateInfo.releaseTitle }}
          </div>

          <div class="update-notes-container">
            <div class="update-notes-header">更新说明与改版内容：</div>
            <pre class="update-notes-pre">{{ updateInfo.releaseNotes }}</pre>
          </div>

          <p class="update-tip">
            点击下方「下载更新并运行」，系统将自动下载最新安装程序并启动更新。您也可以直接前往 GitHub 页面查看或手动下载。
          </p>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showUpdateModal = false" :disabled="isDownloadingUpdate">
            稍后提醒
          </button>
          <button class="btn btn-secondary" @click="openUrl(updateInfo.htmlUrl)">
            <ExternalLink class="btn-icon" />
            <span>在 GitHub 查看</span>
          </button>
          <button class="btn btn-primary btn-update-action" @click="executeUpdate" :disabled="isDownloadingUpdate">
            <DownloadCloud class="btn-icon" :class="{ 'spin-anim': isDownloadingUpdate }" />
            <span>{{ isDownloadingUpdate ? '正在下载更新中...' : '下载更新并运行' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notification -->
    <transition name="toast">
      <div v-if="toast.show" class="toast-card" :class="`toast-${toast.type}`">
        <component
          :is="toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? XCircle : Info"
          class="toast-icon"
        />
        <span>{{ toast.message }}</span>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-app-gradient);
  color: var(--text-main);
}

/* Header */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: var(--bg-header);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 10;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.logo-box {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #0284c7, #6366f1);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 15px rgba(2, 132, 199, 0.4);
}

.logo-icon {
  width: 22px;
  height: 22px;
  color: #fff;
}

.logo-pulse {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  background: #10b981;
  border: 2px solid var(--bg-primary);
  border-radius: 50%;
}

.brand-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-title {
  font-size: 18px;
  font-weight: 700;
  background: var(--brand-title-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.app-version-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  padding: 1px 7px;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.35);
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.app-version-badge:hover {
  background: rgba(56, 189, 248, 0.25);
  border-color: var(--accent-cyan);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
  transform: translateY(-1px);
}

[data-theme="light"] .app-version-badge {
  background: rgba(2, 132, 199, 0.12);
  color: #0284c7;
  border-color: rgba(2, 132, 199, 0.3);
}

.brand-subtitle {
  font-size: 11px;
  color: var(--text-muted);
}

/* Navigation Tabs */
.nav-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-nav);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  color: #fff;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
}

.tab-icon {
  width: 16px;
  height: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Missing Prerequisites Warning Banner */
.prereq-alert-banner {
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15));
  border-bottom: 1px solid rgba(245, 158, 11, 0.35);
  padding: 16px 28px;
}

.prereq-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prereq-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.prereq-warn-icon {
  width: 20px;
  height: 20px;
  color: #f59e0b;
}

.prereq-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-warn-heading);
}

.prereq-cards-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.prereq-item-card {
  flex: 1;
  min-width: 280px;
  background: var(--bg-prereq-card);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.prereq-card-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prereq-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-warn);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.prereq-item-card h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.prereq-item-card p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.prereq-item-card code {
  font-family: 'JetBrains Mono', monospace;
  background: var(--bg-card-footer);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--accent-cyan);
}

.prereq-btn-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-download {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #000;
  font-weight: 600;
  padding: 8px 14px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-download:hover {
  filter: brightness(1.15);
}

.btn-download-alt {
  background: var(--bg-btn-secondary);
  color: var(--text-main);
  font-weight: 500;
  padding: 8px 14px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-download-alt:hover {
  background: var(--bg-btn-secondary-hover);
}

/* Environment Banner */
.env-banner {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 8px 28px;
  background: var(--bg-banner);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--text-secondary);
}

.env-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.env-icon {
  width: 15px;
  height: 15px;
}

.env-ok {
  color: #34d399;
}

.env-warn {
  color: var(--text-warn);
}

.env-neutral {
  color: var(--text-secondary);
}

.clickable-link {
  color: var(--text-warn);
  text-decoration: underline;
  cursor: pointer;
}

.clickable-link:hover {
  color: var(--accent-amber);
}

.ml-auto {
  margin-left: auto;
}

.text-cyan {
  color: var(--accent-cyan);
}

.text-emerald {
  color: var(--accent-emerald);
}

.font-mono {
  font-family: 'JetBrains Mono', monospace;
}

.font-bold {
  font-weight: 600;
}

.mt-2 {
  margin-top: 8px;
}

.count-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  font-size: 12px;
  color: var(--text-secondary);
}

.indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #64748b;
}

.indicator-dot.active {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

/* Main Content */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100%;
}

.sub-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sub-title-group h2 {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-main);
}

.sub-title-group p {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.sub-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Cards Grid */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
}

.drive-card {
  background: var(--bg-card);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  transition: all 0.25s ease;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.drive-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-focus);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.drive-card.card-mounted {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 4px 20px -2px rgba(16, 185, 129, 0.15);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.provider-badge {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.provider-icon {
  width: 22px;
  height: 22px;
}

.remote-meta {
  flex: 1;
  min-width: 0;
}

.remote-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remote-type-tag {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.mount-status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
}

.status-mounted {
  background: var(--bg-emerald-btn);
  color: var(--text-emerald-btn);
  border: 1px solid var(--border-emerald-btn);
}

.status-mounted .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.status-unmounted {
  background: var(--bg-status-unmounted);
  color: var(--text-muted);
}

.status-unmounted .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #64748b;
}

.card-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Sort & Reorder Controls */
.sort-select-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  padding: 6px 12px;
  border-radius: var(--radius-md, 8px);
  color: var(--text-main);
  transition: all 0.2s ease;
}

.sort-select-wrapper:hover,
.sort-select-wrapper:focus-within {
  border-color: var(--accent-cyan);
}

.sort-icon {
  width: 14px;
  height: 14px;
  color: var(--accent-cyan);
  flex-shrink: 0;
}

.sort-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.sort-select {
  background: transparent;
  border: none;
  color: var(--text-main);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  padding-right: 4px;
}

.sort-select option {
  background: #1e293b;
  color: #f1f5f9;
}

[data-theme="light"] .sort-select option {
  background: #ffffff;
  color: #0f172a;
}

.reorder-btns {
  display: flex;
  align-items: center;
  gap: 1px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-card);
  border-radius: 6px;
  padding: 1px;
  margin-right: 2px;
}

[data-theme="light"] .reorder-btns {
  background: rgba(0, 0, 0, 0.04);
}

.icon-btn-reorder {
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn-reorder:disabled {
  opacity: 0.2;
  cursor: not-allowed;
  pointer-events: none;
}

.icon-btn-reorder:hover:not(:disabled) {
  color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.15);
}

.icon-btn-action,
.icon-btn-delete {
  background: transparent;
  color: var(--text-muted);
  padding: 6px;
  border-radius: 4px;
}

.icon-btn-action:hover {
  color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.1);
}

.icon-btn-delete:hover {
  color: #fb7185;
  background: rgba(244, 63, 94, 0.1);
}

.action-icon,
.trash-icon {
  width: 15px;
  height: 15px;
}

.card-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.field-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.field-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.drive-select-wrapper {
  min-width: 140px;
}

.drive-select,
.field-select,
.field-input,
.modal-input {
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  padding: 7px 10px;
  font-size: 13px;
  width: 100%;
  transition: all 0.2s;
}

.drive-select:focus,
.field-select:focus,
.field-input:focus,
.modal-input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px var(--accent-cyan-glow);
}

.drive-locked {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-emerald-btn);
  border: 1px solid var(--border-emerald-btn);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-emerald-btn);
}

.drive-letter-icon {
  width: 16px;
  height: 16px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-top: 4px;
}

.custom-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--border-card);
  background: var(--bg-input);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.custom-checkbox.checked {
  background: var(--accent-cyan);
  border-color: var(--accent-cyan);
}

.check-icon {
  width: 12px;
  height: 12px;
  color: #ffffff;
  stroke-width: 3;
}

.checkbox-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.card-footer {
  padding: 14px 18px;
  background: var(--bg-card-footer);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Glass Card & Sync Grid */
.sync-panel-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.glass-card {
  background: var(--bg-card);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.card-title-icon {
  width: 18px;
  height: 18px;
  color: var(--accent-cyan);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.action-buttons-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.action-buttons-row .btn {
  flex: 1;
}

/* Diff Report Box */
.diff-report-box {
  background: var(--bg-card-footer);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diff-stats-row {
  display: flex;
  gap: 10px;
}

.stat-pill {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.stat-source {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.stat-dest {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.diff-list-container {
  max-height: 140px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  background: var(--bg-table-container);
  color: var(--text-main);
  padding: 8px;
  border-radius: 4px;
}

.diff-line {
  line-height: 1.6;
}

.diff-add {
  color: #34d399;
}

.diff-remove {
  color: #fb7185;
}

.diff-mod {
  color: #fbbf24;
}

/* Task Log Box */
.task-log-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.log-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.log-content {
  background: var(--bg-table-container);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-all;
  height: 160px;
  overflow-y: auto;
}

/* Scheduler Table */
.task-table-wrapper {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.task-table th,
.task-table td {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.task-table th {
  background: var(--bg-table-header);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 12px;
}

.status-pill {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

.pill-active {
  background: var(--bg-emerald-btn);
  color: var(--text-emerald-btn);
}

.pill-disabled {
  background: var(--bg-status-unmounted);
  color: var(--text-muted);
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 11px;
}

/* Web-GUI Iframe */
.webgui-frame-box {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  min-height: 480px;
}

.webgui-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.webgui-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  padding: 40px;
}

.placeholder-icon {
  width: 64px;
  height: 64px;
  color: var(--accent-cyan);
  margin-bottom: 16px;
  opacity: 0.8;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 80px 20px;
}

.empty-icon-box {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.empty-icon {
  width: 36px;
  height: 36px;
  color: var(--accent-cyan);
}

.empty-state h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 10px;
}

.empty-state p {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 480px;
  margin-bottom: 24px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.btn-primary {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #fff;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.35);
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #1d4ed8);
}

.btn-mount-primary {
  width: 100%;
  background: linear-gradient(135deg, #0284c7, #6366f1);
  color: #fff;
  padding: 10px;
  font-weight: 600;
}

.btn-mount-primary:hover:not(:disabled) {
  filter: brightness(1.15);
  box-shadow: 0 4px 15px rgba(2, 132, 199, 0.4);
}

.btn-secondary {
  background: var(--bg-btn-secondary);
  color: var(--text-main);
  border-color: var(--border-subtle);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-btn-secondary-hover);
}

.btn-emerald {
  flex: 1;
  background: var(--bg-emerald-btn);
  color: var(--text-emerald-btn);
  border: 1px solid var(--border-emerald-btn);
}

.btn-emerald:hover:not(:disabled) {
  filter: brightness(1.08);
}

.btn-danger {
  background: var(--bg-danger-btn);
  color: var(--text-danger-btn);
  border: 1px solid var(--border-danger-btn);
}

.btn-danger:hover:not(:disabled) {
  filter: brightness(1.08);
}

.btn-danger-outline {
  background: transparent;
  color: var(--text-danger-btn);
  border: 1px solid var(--border-danger-btn);
}

.btn-danger-outline:hover:not(:disabled) {
  background: var(--bg-danger-btn);
}

.btn-lg {
  padding: 12px 24px;
  font-size: 15px;
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-card {
  width: 520px;
  background: var(--bg-modal);
  color: var(--text-main);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
}

.modal-title-icon {
  width: 20px;
  height: 20px;
  color: var(--accent-cyan);
}

.close-btn {
  background: transparent;
  color: var(--text-muted);
  padding: 4px;
}

.close-btn:hover {
  color: var(--text-main);
}

.close-icon {
  width: 20px;
  height: 20px;
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.group-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.input-with-button {
  display: flex;
  gap: 8px;
}

.input-with-button .modal-input {
  flex: 1;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.switch-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.toggle-switch {
  width: 48px;
  height: 26px;
  background: var(--bg-toggle);
  border-radius: 13px;
  position: relative;
  cursor: pointer;
}

.toggle-slider {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}

.toggle-switch.active {
  background: var(--accent-cyan);
}

.toggle-switch.active .toggle-slider {
  transform: translateX(22px);
}

.info-box {
  background: rgba(56, 189, 248, 0.05);
  border: 1px solid rgba(56, 189, 248, 0.15);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.info-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-cyan);
}

.info-icon {
  width: 15px;
  height: 15px;
}

.link {
  color: var(--accent-cyan);
  text-decoration: underline;
}

.modal-footer {
  padding: 16px 24px;
  background: var(--bg-modal-footer);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* Toast */
.toast-card {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-lg);
  z-index: 200;
  backdrop-filter: blur(12px);
}

.toast-icon {
  width: 18px;
  height: 18px;
}

.toast-success {
  background: rgba(6, 78, 59, 0.9);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.toast-error {
  background: rgba(136, 19, 55, 0.9);
  color: #fda4af;
  border: 1px solid rgba(244, 63, 94, 0.4);
}

.toast-info {
  background: var(--bg-modal);
  color: var(--text-main);
  border: 1px solid var(--border-subtle);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}

.spin-anim {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* --- RcloneView Plus & Path Selection Styles --- */
.field-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.quick-links-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.quick-link-label {
  font-size: 11px;
  color: var(--text-muted);
}

.btn-tag {
  background: rgba(56, 189, 248, 0.1);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-tag:hover {
  background: rgba(56, 189, 248, 0.25);
  border-color: var(--accent-cyan);
}

.input-with-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-with-actions .modal-input {
  flex: 1;
}

.btn-browse {
  background: rgba(56, 189, 248, 0.12);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 8px 12px;
  font-size: 12px;
  white-space: nowrap;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-browse:hover {
  background: rgba(56, 189, 248, 0.25);
  border-color: var(--accent-cyan);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
}

.btn-browse-cloud {
  background: rgba(168, 85, 247, 0.12);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
  padding: 8px 12px;
  font-size: 12px;
  white-space: nowrap;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-browse-cloud:hover {
  background: rgba(168, 85, 247, 0.25);
  border-color: #c084fc;
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.2);
}

.quick-filters-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.quick-filter-tag {
  background: var(--bg-card-footer);
  border: 1px dashed var(--border-subtle);
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.quick-filter-tag:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.08);
}

/* Compare Card Header */
.compare-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.compare-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-xs {
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 4px;
}

.btn-icon-xs {
  width: 12px;
  height: 12px;
}

.btn-schedule {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  color: white;
  border: none;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
  transition: all 0.2s;
}

.btn-schedule:hover:not(:disabled) {
  background: linear-gradient(135deg, #047857 0%, #059669 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.45);
}

.btn-schedule-outline {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
  transition: all 0.15s;
}

.btn-schedule-outline:hover {
  background: rgba(16, 185, 129, 0.25);
  border-color: #34d399;
}

/* --- RcloneView Classical Two-Column View & Compact Setup Styles --- */
.setup-card-compact {
  padding: 16px 20px;
  margin-bottom: 14px;
}

.setup-compact-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.setup-compact-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.setup-compact-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setup-inputs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 12px;
}

.form-group-compact {
  display: flex;
  flex-direction: column;
}

.setup-options-row {
  display: flex;
  gap: 14px;
  align-items: flex-end;
  background: var(--bg-card-footer);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
}

.option-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.flex-2 { flex: 2; }
.flex-3 { flex: 3; }

.field-label-compact {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.modal-input-compact {
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.modal-input-compact:focus {
  border-color: var(--accent-cyan);
}

.checkbox-center {
  display: flex;
  flex-direction: row;
  align-items: center;
  cursor: pointer;
  padding-top: 18px;
}

/* RcloneView Main Compare View (全宽卡片) */
.rcloneview-main-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 480px;
}

.rcloneview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.rcloneview-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rcloneview-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.rcloneview-count-badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-card-footer);
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid var(--border-subtle);
}

.rcloneview-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* RcloneView Blue Path Header (如 RcloneView 截屏顶部的深蓝色左右条) */
.rcloneview-path-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #0284c7; /* RcloneView signature blue */
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  color: #ffffff;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.path-col {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  overflow: hidden;
}

.path-src {
  border-right: 1px solid rgba(255, 255, 255, 0.25);
}

.path-star, .path-triangle {
  font-size: 12px;
  flex-shrink: 0;
}

.path-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
  letter-spacing: -0.2px;
  flex: 1;
}

.path-icon-right {
  width: 14px;
  height: 14px;
  color: #fef08a;
  flex-shrink: 0;
}

/* RcloneView Toolbar: Display filters, buttons, search */
.rcloneview-action-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  background: var(--bg-toolbar);
  border-left: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  padding: 6px 10px;
}

.display-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.toolbar-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  margin-right: 2px;
}

.rv-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  background: var(--bg-btn-secondary);
  color: var(--text-muted);
  transition: all 0.15s;
}

.rv-icon {
  width: 12px;
  height: 12px;
}

.rv-toggle-btn.active.toggle-src {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.6);
  color: #34d399;
}

.rv-toggle-btn.active.toggle-dest {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.6);
  color: #38bdf8;
}

.rv-toggle-btn.active.toggle-eq {
  background: rgba(148, 163, 184, 0.2);
  border-color: rgba(148, 163, 184, 0.6);
  color: #e2e8f0;
}

.rv-toggle-btn.active.toggle-diff {
  background: rgba(168, 85, 247, 0.2);
  border-color: rgba(168, 85, 247, 0.6);
  color: #d8b4fe;
}

.rv-toggle-btn.active.toggle-err {
  background: rgba(244, 63, 94, 0.2);
  border-color: rgba(244, 63, 94, 0.6);
  color: #fb7185;
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.search-group {
  margin-left: auto;
}

.rv-search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
}

.rv-search-icon {
  width: 12px;
  height: 12px;
  color: var(--text-muted);
}

.rv-search-input {
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 11px;
  width: 160px;
  outline: none;
}

/* RcloneView Classical Table Styling */
.rcloneview-table-container {
  flex: 1;
  max-height: 480px;
  overflow-y: auto;
  border-left: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-table-container);
}

.rv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}

.rv-thead-row {
  position: sticky;
  top: 0;
  background: var(--bg-table-header);
  z-index: 10;
  border-bottom: 1px solid var(--border-subtle);
}

.rv-thead-row th {
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-align: left;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

/* Column Width Distributions */
.col-chk { width: 32px; text-align: center; }
.col-src-name { width: 28%; }
.col-src-size { width: 8%; text-align: right; }
.col-src-date { width: 12%; }

.col-dir {
  width: 44px;
  text-align: center;
  background: var(--bg-table-header);
  border-left: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
}

.col-dst-name { width: 28%; }
.col-dst-size { width: 8%; text-align: right; }
.col-dst-date { width: 12%; }
.col-act { width: 65px; text-align: center; }

/* Rows */
.rv-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: background 0.1s;
}

.rv-row:hover {
  background: var(--bg-card-hover);
}

/* User's red-boxed selection effect (柔和淡蓝色选中高亮背景) */
.rv-row.rv-row-selected {
  background: rgba(56, 189, 248, 0.16) !important;
  border-bottom-color: rgba(56, 189, 248, 0.3) !important;
}

.rv-row td {
  padding: 5px 8px;
  vertical-align: middle;
  border-right: 1px solid rgba(255, 255, 255, 0.03);
}

.rv-file-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  white-space: nowrap;
}

.entry-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.entry-name {
  font-family: monospace;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-empty {
  color: var(--text-muted);
  font-style: italic;
}

.entry-placeholder {
  color: #64748b;
  font-size: 11px;
  font-style: italic;
}

.dir-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
}

.dir-icon {
  width: 15px;
  height: 15px;
}

.text-amber { color: #f59e0b; }

.rv-empty-cell {
  text-align: center;
  padding: 40px;
}

.placeholder-height {
  padding: 80px 20px;
}

.rv-empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
}

.rv-empty-box h4 {
  font-size: 15px;
  color: var(--text-primary);
}

.rv-empty-box p {
  font-size: 12px;
}

/* Classical RcloneView Bottom Statusbar */
.rcloneview-statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-statusbar);
  border: 1px solid var(--border-subtle);
  border-top: none;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  padding: 5px 12px;
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 500;
}

.selected-count-tag {
  color: var(--accent-cyan);
  font-weight: 700;
}

/* Task Log Details Drawer */
.task-log-details {
  margin-top: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.log-summary {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card-footer);
}

.log-summary-hint {
  font-size: 11px;
  color: var(--accent-cyan);
}

.log-content-pre {
  padding: 10px 12px;
  font-family: monospace;
  font-size: 11px;
  color: var(--text-secondary);
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  margin: 0;
}

.diff-empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.diff-empty-placeholder .empty-icon {
  width: 48px;
  height: 48px;
  color: var(--text-muted);
  opacity: 0.6;
  margin-bottom: 8px;
}

.diff-empty-placeholder h4 {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.diff-empty-placeholder p {
  font-size: 12px;
  color: var(--text-muted);
}

/* Cloud Directory Browser Modal */
.cloud-browser-modal {
  max-width: 580px;
}

.cloud-breadcrumb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card-footer);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  margin-bottom: 10px;
  border: 1px solid var(--border-subtle);
}

.cloud-current-path {
  font-family: monospace;
  font-size: 12px;
  color: var(--accent-cyan);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-dirs-container {
  height: 240px;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 6px;
  margin-bottom: 10px;
}

.cloud-dirs-loading,
.cloud-dirs-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-muted);
  font-size: 12px;
}

.cloud-dirs-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cloud-dir-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s;
  background: var(--bg-card-footer);
}

.cloud-dir-item:hover {
  background: rgba(56, 189, 248, 0.1);
  color: var(--accent-cyan);
}

.cloud-dir-icon {
  width: 15px;
  height: 15px;
  color: #f59e0b;
}

.cloud-dir-name {
  font-size: 12px;
  font-weight: 500;
}

/* Multi-destination styling */
.badge-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.badge-cyan {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}

.dest-label-with-tag {
  display: flex;
  align-items: center;
  gap: 8px;
}

.destinations-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.extra-dest-group {
  padding-top: 10px;
  border-top: 1px dashed var(--border-card);
}

.add-destination-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.btn-add-dest {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 15px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #f59e0b, #ea580c);
  color: #ffffff;
  border: 1px solid rgba(245, 158, 11, 0.5);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-add-dest:hover {
  filter: brightness(1.12);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.45);
  transform: translateY(-1px);
}

.btn-add-dest:active {
  transform: translateY(0);
}

.dest-count-hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* Update Modal Styling */
.update-modal-card {
  max-width: 580px;
}

.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(16, 185, 129, 0.08));
  border: 1px solid rgba(56, 189, 248, 0.25);
  margin-bottom: 14px;
}

.update-version-tag {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-weight: 700;
}

.old-ver {
  color: var(--text-muted);
  font-size: 14px;
}

.ver-arrow {
  width: 16px;
  height: 16px;
  color: #38bdf8;
}

.new-ver {
  color: #10b981;
  font-size: 16px;
  background: rgba(16, 185, 129, 0.2);
  padding: 2px 8px;
  border-radius: 6px;
}

.update-date {
  font-size: 12px;
  color: var(--text-muted);
}

.update-release-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 10px;
}

.update-notes-container {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: 12px;
  margin-bottom: 12px;
}

.update-notes-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.update-notes-pre {
  max-height: 160px;
  overflow-y: auto;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.update-tip {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.btn-update-action {
  background: linear-gradient(135deg, #0284c7, #059669);
  color: #fff;
  border: none;
  font-weight: 600;
}

.btn-update-action:hover:not(:disabled) {
  filter: brightness(1.1);
}

.modal-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input-wrapper .search-icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  pointer-events: none;
}

.search-input-wrapper .search-input {
  padding-left: 32px;
  padding-right: 28px;
  font-size: 12px;
}

.search-clear-btn {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.search-clear-btn:hover {
  color: var(--text-main);
}

.search-clear-btn .clear-icon {
  width: 14px;
  height: 14px;
}

.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-wrapper .modal-input {
  padding-right: 36px;
}

.toggle-eye-btn {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: color 0.15s ease;
}

.toggle-eye-btn:hover {
  color: var(--text-main);
}

.toggle-eye-btn .eye-icon {
  width: 16px;
  height: 16px;
}

.s3-alert {
  border-color: rgba(245, 158, 11, 0.3) !important;
  background: rgba(245, 158, 11, 0.08) !important;
}

.grid-2-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
}

.advanced-details {
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  background: var(--bg-hover-subtle);
}

.advanced-summary {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}

.advanced-summary:hover {
  color: var(--text-main);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  accent-color: #0284c7;
  cursor: pointer;
}

@media (max-width: 900px) {
  .btn-text-hide-sm {
    display: none;
  }
}

/* ==========================================================================
   MOUNT PERFORMANCE TUNING & PRESETS STYLES
   ========================================================================== */
.perf-preset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.btn-toggle-adv {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: var(--accent-cyan);
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-toggle-adv:hover,
.btn-toggle-adv.active {
  background: rgba(56, 189, 248, 0.18);
  border-color: var(--accent-cyan);
  color: #ffffff;
}

.btn-adv-icon {
  width: 12px;
  height: 12px;
}

.btn-chevron-icon {
  width: 12px;
  height: 12px;
  transition: transform 0.2s ease;
}

.btn-chevron-icon.rotated {
  transform: rotate(180deg);
}

.preset-pill-group {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}

.preset-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: var(--bg-btn-secondary);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-pill:hover {
  background: var(--bg-btn-secondary-hover);
  color: var(--text-main);
  border-color: rgba(255, 255, 255, 0.15);
}

.preset-pill.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
}

.preset-pill .pill-icon {
  width: 13px;
  height: 13px;
}

.preset-hint-box {
  background: rgba(0, 0, 0, 0.2);
  border-left: 3px solid var(--border-subtle);
  padding: 6px 10px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.preset-hint-box p {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
}

.hint-fast {
  color: #38bdf8;
  border-left-color: #38bdf8 !important;
}

.hint-default {
  color: var(--text-secondary);
}

.hint-custom {
  color: #a78bfa;
}

/* Advanced Options Accordion Panel */
.advanced-opts-panel {
  background: rgba(10, 15, 26, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: var(--radius-md);
  padding: 12px;
  margin-top: 8px;
  margin-bottom: 12px;
  animation: slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.adv-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-cyan);
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-subtle);
}

.panel-title-icon {
  width: 14px;
  height: 14px;
}

.adv-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 10px;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.adv-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 10px;
  margin-bottom: 6px;
}

.adv-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.adv-field-full {
  grid-column: 1 / -1;
}

.adv-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.adv-select,
.adv-input {
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-size: 11px;
  padding: 5px 8px;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s ease;
}

.adv-select:focus,
.adv-input:focus {
  border-color: var(--accent-cyan);
}

.adv-field-toggle {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 10px;
}

.adv-toggle-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.adv-toggle-desc {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.3;
}

.toggle-switch-sm {
  width: 32px;
  height: 18px;
  background: var(--bg-toggle);
  border-radius: 9px;
  border: none;
  cursor: pointer;
  position: relative;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
  padding: 0;
}

.toggle-switch-sm.active {
  background: var(--accent-emerald);
}

.toggle-slider-sm {
  width: 14px;
  height: 14px;
  background: #ffffff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
}

.toggle-switch-sm.active .toggle-slider-sm {
  transform: translateX(14px);
}

.adv-panel-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
}

/* Mounted Status Badge */
.mounted-perf-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}

.perf-badge-icon {
  width: 12px;
  height: 12px;
  color: #38bdf8;
}

/* ── 手动刷新缓存按钮 ── */
.btn-cache-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-cache-refresh:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.22);
  border-color: rgba(245, 158, 11, 0.55);
  color: #fde68a;
  box-shadow: 0 0 12px -2px rgba(245, 158, 11, 0.3);
  transform: translateY(-1px);
}

.btn-cache-refresh:active:not(:disabled) {
  transform: translateY(0);
}

.btn-cache-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

[data-theme="light"] .btn-cache-refresh {
  color: #92400e;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
}

[data-theme="light"] .btn-cache-refresh:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.18);
  color: #78350f;
}
</style>
