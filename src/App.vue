<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
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
import { useI18n } from "vue-i18n";
import { LANGUAGES, normalizeLocale, setLocale } from "./i18n";

const { t, locale } = useI18n();
const languages = LANGUAGES;

// 日期/时间本地化：将界面语言映射为 Intl 支持的 locale（en → en-US）
function dateLocale() {
  return locale.value === "en" ? "en-US" : locale.value;
}

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
  showToast(isLightMode.value ? t("msg.theme.light") : t("msg.theme.dark"), "info");
}

async function changeLanguage(code) {
  const next = setLocale(code);
  localStorage.setItem("rclone_language", next);
  try {
    await invoke("save_app_settings", {
      settings: {
        start_minimized_to_tray: startMinimizedActive.value,
        language: next,
      },
    });
    showToast(t("settings.languageSaved"), "success");
  } catch (err) {
    showToast(String(err), "error");
  }
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
  const presetName = preset === 'fast' ? t('msg.preset.fast') : preset === 'default' ? t('msg.preset.default') : t('msg.preset.custom');
  showToast(t("msg.preset.updated", { name: presetName }), "info");
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
  { value: "AWS", labelKey: "provider.s3.aws.label", defaultRegion: "us-east-1", defaultEndpoint: "", hintKey: "provider.s3.aws.hint" },
  { value: "Cloudflare", labelKey: "provider.s3.cloudflare.label", defaultRegion: "auto", defaultEndpoint: "", hintKey: "provider.s3.cloudflare.hint" },
  { value: "Minio", labelKey: "provider.s3.minio.label", defaultRegion: "", defaultEndpoint: "http://127.0.0.1:9000", forcePathStyle: true, hintKey: "provider.s3.minio.hint" },
  { value: "Wasabi", labelKey: "provider.s3.wasabi.label", defaultRegion: "us-east-1", defaultEndpoint: "", hintKey: "provider.s3.wasabi.hint" },
  { value: "Backblaze", labelKey: "provider.s3.backblaze.label", defaultRegion: "us-west-004", defaultEndpoint: "s3.us-west-004.backblazeb2.com", hintKey: "provider.s3.backblaze.hint" },
  { value: "Alibaba", labelKey: "provider.s3.alibaba.label", defaultRegion: "oss-cn-hangzhou", defaultEndpoint: "oss-cn-hangzhou.aliyuncs.com", hintKey: "provider.s3.alibaba.hint" },
  { value: "TencentCOS", labelKey: "provider.s3.tencentcos.label", defaultRegion: "ap-guangzhou", defaultEndpoint: "cos.ap-guangzhou.myqcloud.com", hintKey: "provider.s3.tencentcos.hint" },
  { value: "DigitalOcean", labelKey: "provider.s3.digitalocean.label", defaultRegion: "nyc3", defaultEndpoint: "nyc3.digitaloceanspaces.com", hintKey: "provider.s3.digitalocean.hint" },
  { value: "Ceph", labelKey: "provider.s3.ceph.label", defaultRegion: "", defaultEndpoint: "", hintKey: "provider.s3.ceph.hint" },
  { value: "Other", labelKey: "provider.s3.other.label", defaultRegion: "", defaultEndpoint: "", hintKey: "provider.s3.other.hint" }
];

const STORAGE_CATEGORIES = [
  {
    id: "personal",
    labelKey: "provider.category.personal",
    items: [
      { type: "drive", nameKey: "provider.drive.name", auth: "oauth", hintKey: "provider.drive.hint" },
      { type: "onedrive", nameKey: "provider.onedrive.name", auth: "oauth", hintKey: "provider.onedrive.hint" },
      { type: "dropbox", nameKey: "provider.dropbox.name", auth: "oauth", hintKey: "provider.dropbox.hint" },
      { type: "box", nameKey: "provider.box.name", auth: "oauth", hintKey: "provider.box.hint" },
      { type: "pcloud", nameKey: "provider.pcloud.name", auth: "oauth", hintKey: "provider.pcloud.hint" },
      { type: "mega", nameKey: "provider.mega.name", auth: "credentials", hintKey: "provider.mega.hint" },
      { type: "protondrive", nameKey: "provider.protondrive.name", auth: "credentials", hintKey: "provider.protondrive.hint" },
      { type: "yandex", nameKey: "provider.yandex.name", auth: "oauth", hintKey: "provider.yandex.hint" },
      { type: "koofr", nameKey: "provider.koofr.name", auth: "credentials", hintKey: "provider.koofr.hint" }
    ]
  },
  {
    id: "cloud-cn",
    labelKey: "provider.category.cloud-cn",
    items: [
      { type: "pikpak", nameKey: "provider.pikpak.name", auth: "credentials", hintKey: "provider.pikpak.hint" },
      { type: "nutstore", nameKey: "provider.nutstore.name", auth: "webdav", hintKey: "provider.nutstore.hint" },
      { type: "pan123", nameKey: "provider.pan123.name", auth: "webdav", hintKey: "provider.pan123.hint" },
      { type: "openlist", nameKey: "provider.openlist.name", auth: "webdav", hintKey: "provider.openlist.hint" }
    ]
  },
  {
    id: "object",
    labelKey: "provider.category.object",
    items: [
      { type: "s3", nameKey: "provider.s3.name", auth: "s3", hintKey: "provider.s3.hint" },
      { type: "b2", nameKey: "provider.b2.name", auth: "b2", hintKey: "provider.b2.hint" },
      { type: "gcs", nameKey: "provider.gcs.name", auth: "oauth", hintKey: "provider.gcs.hint" },
      { type: "azureblob", nameKey: "provider.azureblob.name", auth: "azure", hintKey: "provider.azureblob.hint" }
    ]
  },
  {
    id: "protocol",
    labelKey: "provider.category.protocol",
    items: [
      { type: "webdav", nameKey: "provider.webdav.name", auth: "webdav", hintKey: "provider.webdav.hint" },
      { type: "smb", nameKey: "provider.smb.name", auth: "smb", hintKey: "provider.smb.hint" },
      { type: "sftp", nameKey: "provider.sftp.name", auth: "sftp", hintKey: "provider.sftp.hint" },
      { type: "ftp", nameKey: "provider.ftp.name", auth: "ftp", hintKey: "provider.ftp.hint" }
    ]
  },
  {
    id: "local",
    labelKey: "provider.category.local",
    items: [
      { type: "local", nameKey: "provider.local.name", auth: "local", hintKey: "provider.local.hint" },
      { type: "crypt", nameKey: "provider.crypt.name", auth: "crypt", hintKey: "provider.crypt.hint" },
      { type: "union", nameKey: "provider.union.name", auth: "union", hintKey: "provider.union.hint" }
    ]
  }
];

function isOAuthType(type = "") {
  const t = (type || "").toLowerCase();
  return ["drive", "onedrive", "dropbox", "box", "pcloud", "yandex"].includes(t);
}

// ==========================================
// 中国大陆常用网盘 (PikPak 原生 + 坚果云 / OpenList WebDAV 预设)
// ==========================================
const CHINA_NETDISK_TYPES = ["pikpak", "nutstore", "pan123", "openlist"];

// 预设类型 -> rclone 实际 backend 类型
function resolveRcloneBackendType(type = "") {
  if (type === "nutstore" || type === "pan123" || type === "openlist") return "webdav";
  return type;
}

function isChinaNetdiskType(type = "") {
  return CHINA_NETDISK_TYPES.includes(type);
}

// 补全协议头；若只填了主机与端口，自动补上 OpenList 默认的 /dav 路径
function normalizeWebdavUrl(raw = "") {
  let u = (raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  try {
    const parsed = new URL(u);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/dav";
    }
    return parsed.toString();
  } catch (_) {
    return u;
  }
}

// 大陆网盘的中文标签，写入 rclone description，用于列表徽标识别
function chinaNetdiskLabel(type = "") {
  if (type === "pikpak") return "PikPak 网盘";
  if (type === "nutstore") return "坚果云 WebDAV";
  if (type === "pan123") return "123 云盘 WebDAV";
  if (type === "openlist") return "OpenList/AList 聚合";
  return "";
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
  remotePath: "",
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
  remotePath: "",
  description: "",
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

function onNewRemoteTypeChange() {
  // 依协议套用正确的默认端口，避免 SFTP 误用 FTP 的 21 端口
  const t = newRemoteForm.type;
  newRemoteForm.port = t === "sftp" ? "22" : t === "smb" ? "445" : t === "ftp" ? "21" : "";
}

async function handleOpenRcloneTerminal() {
  try {
    await invoke("open_rclone_config_terminal", {
      rclonePath: customRclonePath.value.trim() || null
    });
    showToast(t("msg.terminal.opened"), "info");
  } catch (err) {
    showToast(t("msg.terminal.openFailed", { error: err }), "error");
  }
}

// 本地化后的存储分类列表（搜索过滤需匹配当前语言显示文本）
const localizedStorageCategories = computed(() =>
  STORAGE_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: t(cat.labelKey),
    items: cat.items.map((it) => ({
      ...it,
      name: t(it.nameKey),
      hint: t(it.hintKey)
    }))
  }))
);

const filteredStorageCategories = computed(() => {
  const kw = (newRemoteForm.searchProvider || "").trim().toLowerCase();
  if (!kw) return localizedStorageCategories.value;
  return localizedStorageCategories.value
    .map((cat) => {
      return {
        ...cat,
        items: cat.items.filter(
          (it) =>
            it.name.toLowerCase().includes(kw) ||
            it.type.toLowerCase().includes(kw) ||
            (it.hint && it.hint.toLowerCase().includes(kw))
        )
      };
    })
    .filter((cat) => cat.items.length > 0);
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
// 旧版 localStorage 中 task.status 存的是中文值，这里迁移为 ASCII 枚举（源码用 \u 转义表示旧值）
const LEGACY_TASK_STATUS = {
  "\u5f85\u547d": "idle", // 待命
  "\u8fd0\u884c\u4e2d...": "running", // 运行中...
  "\u6210\u529f\u5b8c\u6210": "success", // 成功完成
  "\u8fd0\u884c\u5931\u8d25": "failed" // 运行失败
};
const LEGACY_NEVER_RUN = "\u4ece\u672a\u8fd0\u884c"; // 从未运行

function normalizeStoredTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => {
    const migrated = { ...task };
    if (migrated.status && LEGACY_TASK_STATUS[migrated.status]) {
      migrated.status = LEGACY_TASK_STATUS[migrated.status];
    }
    if (migrated.lastRun === LEGACY_NEVER_RUN) {
      migrated.lastRun = "";
    }
    return migrated;
  });
}

const scheduledTasks = ref(normalizeStoredTasks(JSON.parse(localStorage.getItem("rclone_scheduled_tasks") || "[]")));
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
const CURRENT_VERSION = "1.6.8";
const GITHUB_REPO = "Alia2006/rclone-drive";

const savedUpdateSettings = JSON.parse(localStorage.getItem("rclone_update_settings") || "{}");
const LEGACY_NEVER_CHECKED = "\u4ece\u672a\u68c0\u67e5"; // 旧版默认值「从未检查」，迁移为空字符串
const savedLastCheckTimeStr = savedUpdateSettings.lastCheckTimeStr;
const updateSettings = reactive({
  enabled: savedUpdateSettings.enabled !== false, // 默认打开自动检查
  intervalDays: Number(savedUpdateSettings.intervalDays) || 7, // 默认一周 (7 天)
  lastCheckTs: Number(savedUpdateSettings.lastCheckTs) || 0,
  lastCheckTimeStr: savedLastCheckTimeStr && savedLastCheckTimeStr !== LEGACY_NEVER_CHECKED ? savedLastCheckTimeStr : ""
});

function saveUpdateSettings() {
  localStorage.setItem("rclone_update_settings", JSON.stringify(updateSettings));
}

function toggleUpdateEnabled() {
  updateSettings.enabled = !updateSettings.enabled;
  saveUpdateSettings();
  showToast(updateSettings.enabled ? t("msg.update.autoEnabled") : t("msg.update.autoDisabled"), "info");
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
      throw new Error(t("msg.update.apiError", { status: res.status, statusText: res.statusText }));
    }
    const data = await res.json();
    const latestTag = data.tag_name || "";

    updateSettings.lastCheckTs = Date.now();
    updateSettings.lastCheckTimeStr = new Date().toLocaleString(dateLocale());
    saveUpdateSettings();

    if (compareSemver(latestTag, CURRENT_VERSION) > 0) {
      updateInfo.latestVersion = latestTag.replace(/^v/i, "");
      updateInfo.currentVersion = CURRENT_VERSION;
      updateInfo.releaseTitle = data.name || latestTag;
      updateInfo.releaseNotes = data.body || t("msg.update.defaultNotes");
      updateInfo.publishedAt = data.published_at ? new Date(data.published_at).toLocaleDateString(dateLocale()) : "";
      updateInfo.htmlUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;

      let assetUrl = "";
      let assetName = "";
      if (Array.isArray(data.assets)) {
        // 更新必须保持用户原有安装方式：
        // NSIS 安装 → 只拿 Setup 安装包；MSI 安装 → 只拿 MSI；免安装/未知 → 不自动升级，打开发布页手动下载
        const assets = data.assets;
        let installType = "portable";
        try {
          installType = await invoke("get_install_type");
        } catch (_) {}
        const lower = (a) => a.name.toLowerCase();
        const setupAsset = assets.find(
          (a) => lower(a).endsWith(".exe") && /setup|installer/.test(lower(a)) && !lower(a).includes("portable")
        );
        const msiAsset = assets.find((a) => lower(a).endsWith(".msi"));
        let chosen = null;
        if (installType === "nsis") {
          chosen = setupAsset || null;
        } else if (installType === "msi") {
          chosen = msiAsset || null;
        }
        // portable/unknown → chosen 为 null，downloadUrl 回落到发布页
        if (chosen) {
          assetUrl = chosen.browser_download_url;
          assetName = chosen.name;
        }
      }
      updateInfo.downloadUrl = assetUrl || updateInfo.htmlUrl;
      updateInfo.assetName = assetName;

      showUpdateModal.value = true;
    } else {
      if (manual) {
        showToast(t("msg.update.upToDate", { version: CURRENT_VERSION }), "success");
      }
    }
  } catch (err) {
    if (manual) {
      showToast(t("msg.update.checkFailed", { error: err.message || err }), "error");
    }
  } finally {
    isCheckingUpdate.value = false;
  }
}

async function executeUpdate() {
  // 兜底：免安装版(Portable)不能用于就地升级——它只在临时目录运行，不会替换已安装的旧版本
  const isPortableAsset = /portable/i.test(updateInfo.downloadUrl || "");
  if (
    isPortableAsset ||
    !updateInfo.downloadUrl ||
    (!updateInfo.downloadUrl.endsWith(".exe") && !updateInfo.downloadUrl.endsWith(".msi"))
  ) {
    await openUrl(updateInfo.htmlUrl);
    showUpdateModal.value = false;
    return;
  }

  isDownloadingUpdate.value = true;
  showToast(t("msg.update.installing"), "info");
  try {
    // 1. 先安全卸载所有已挂载的磁盘
    try {
      await invoke("unmount_all");
      await refreshAll();
    } catch (_) {}

    const msg = await invoke("download_and_install_update", {
      downloadUrl: updateInfo.downloadUrl
    });
    showToast(msg || t("msg.update.launchSuccess"), "success");
    showUpdateModal.value = false;
  } catch (err) {
    showToast(t("msg.update.startFailed", { error: err }), "error");
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
    showToast(t("msg.explorer.openUrlFailed", { error: err }), "error");
  }
}

// Provider details helper
function getProviderDetails(type = "", description = "") {
  const t = (type || "").toLowerCase();
  const d = (description || "").toLowerCase();
  // 大陆网盘通过 description 标记识别（底层多为 webdav）
  if (d.includes("坚果云") || d.includes("nutstore")) return { nameKey: "provider.detail.nutstore", color: "#00B96B", bg: "rgba(0, 185, 107, 0.15)" };
  if (d.includes("123云盘") || d.includes("123 云盘") || d.includes("123pan")) return { nameKey: "provider.detail.pan123", color: "#2F6BFF", bg: "rgba(47, 107, 255, 0.15)" };
  if (d.includes("openlist") || d.includes("alist")) return { nameKey: "provider.detail.openlist", color: "#6366F1", bg: "rgba(99, 102, 241, 0.15)" };
  if (t.includes("pikpak")) return { nameKey: "provider.detail.pikpak", color: "#00A3FF", bg: "rgba(0, 163, 255, 0.15)" };
  if (t.includes("nutstore") || t.includes("jianguoyun")) return { nameKey: "provider.detail.nutstore", color: "#00B96B", bg: "rgba(0, 185, 107, 0.15)" };
  if (t.includes("pan123") || t.includes("123pan")) return { nameKey: "provider.detail.pan123", color: "#2F6BFF", bg: "rgba(47, 107, 255, 0.15)" };
  if (t.includes("openlist") || t.includes("alist")) return { nameKey: "provider.detail.openlist", color: "#6366F1", bg: "rgba(99, 102, 241, 0.15)" };
  if (t.includes("onedrive")) return { nameKey: "provider.detail.onedrive", color: "#0078D4", bg: "rgba(0, 120, 212, 0.15)" };
  if (t.includes("drive") && !t.includes("onedrive") && !t.includes("proton") && !t.includes("huawei")) return { nameKey: "provider.detail.drive", color: "#4285F4", bg: "rgba(66, 133, 244, 0.15)" };
  if (t.includes("photo")) return { nameKey: "provider.detail.photos", color: "#EA4335", bg: "rgba(234, 67, 53, 0.15)" };
  if (t.includes("dropbox")) return { nameKey: "provider.detail.dropbox", color: "#0061FF", bg: "rgba(0, 97, 255, 0.15)" };
  if (t.includes("s3")) return { nameKey: "provider.detail.s3", color: "#FF9900", bg: "rgba(255, 153, 0, 0.15)" };
  if (t.includes("b2")) return { nameKey: "provider.detail.b2", color: "#E01F26", bg: "rgba(224, 31, 38, 0.15)" };
  if (t.includes("azureblob") || t.includes("azurefiles")) return { nameKey: "provider.detail.azureblob", color: "#0089D6", bg: "rgba(0, 137, 214, 0.15)" };
  if (t.includes("gcs") || t.includes("googlecloudstorage")) return { nameKey: "provider.detail.gcs", color: "#4285F4", bg: "rgba(66, 133, 244, 0.15)" };
  if (t.includes("box")) return { nameKey: "provider.detail.box", color: "#0061D5", bg: "rgba(0, 97, 213, 0.15)" };
  if (t.includes("pcloud")) return { nameKey: "provider.detail.pcloud", color: "#13B5EA", bg: "rgba(19, 181, 234, 0.15)" };
  if (t.includes("mega")) return { nameKey: "provider.detail.mega", color: "#D90007", bg: "rgba(217, 0, 7, 0.15)" };
  if (t.includes("proton")) return { nameKey: "provider.detail.proton", color: "#6D4AFF", bg: "rgba(109, 74, 255, 0.15)" };
  if (t.includes("webdav")) return { nameKey: "provider.detail.webdav", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)" };
  if (t.includes("smb")) return { nameKey: "provider.detail.smb", color: "#3B82F6", bg: "rgba(59, 130, 246, 0.15)" };
  if (t.includes("sftp")) return { nameKey: "provider.detail.sftp", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.15)" };
  if (t.includes("ftp")) return { nameKey: "provider.detail.ftp", color: "#A855F7", bg: "rgba(168, 85, 247, 0.15)" };
  if (t.includes("local")) return { nameKey: "provider.detail.local", color: "#14B8A6", bg: "rgba(20, 184, 166, 0.15)" };
  if (t.includes("crypt")) return { nameKey: "provider.detail.crypt", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.15)" };
  if (t.includes("union")) return { nameKey: "provider.detail.union", color: "#EC4899", bg: "rgba(236, 72, 153, 0.15)" };
  // 未识别类型：nameRaw 保留原始 backend 类型用于显示，空类型回退到「云存储」
  return { nameKey: "provider.detail.unknown", nameRaw: type || "", color: "#38BDF8", bg: "rgba(56, 189, 248, 0.15)" };
}

// 列表徽标显示名：未识别类型直接显示原始 backend 名，其余按 nameKey 本地化
function providerDetailName(type = "", description = "") {
  const detail = getProviderDetails(type, description);
  return detail.nameRaw || t(detail.nameKey);
}

// Autostart & Start Minimized
async function checkAutostart() {
  try {
    autostartActive.value = await isEnabled();
    const settings = await invoke("get_app_settings");
    if (settings && typeof settings.start_minimized_to_tray === "boolean") {
      startMinimizedActive.value = settings.start_minimized_to_tray;
    }
    if (!localStorage.getItem("rclone_language") && normalizeLocale(settings?.language)) {
      localStorage.setItem("rclone_language", setLocale(settings.language));
    }
  } catch (err) {
    console.error("Failed to check autostart and preferences:", err);
  }
}

async function toggleAutostart() {
  try {
    if (autostartActive.value) {
      await disable();
      autostartActive.value = false;
      showToast(t("msg.autostart.disabled"), "info");
    } else {
      await enable();
      autostartActive.value = true;
      showToast(t("msg.autostart.enabled"), "success");
    }
  } catch (err) {
    showToast(t("msg.autostart.failed", { error: err }), "error");
  }
}

async function toggleStartMinimized() {
  try {
    startMinimizedActive.value = !startMinimizedActive.value;
    await invoke("save_app_settings", {
      settings: {
        start_minimized_to_tray: startMinimizedActive.value,
        language: locale.value
      }
    });
    showToast(
      startMinimizedActive.value
        ? t("msg.tray.enabled")
        : t("msg.tray.disabled"),
      "success"
    );
  } catch (err) {
    showToast(t("msg.tray.failed", { error: err }), "error");
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
    showToast(t("msg.sort.autoSwitched"), "info");
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
      console.warn("Failed to apply drive icons:", e);
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
          mountOptions: getDefaultMountOptions(defPreset),
          remotePath: ""
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
    showToast(t("msg.app.loadFailed", { error: err }), "error");
  } finally {
    isRefreshing.value = false;
  }
}

// Mount Remote (Network Mode exclusively)
async function mountDrive(remoteName, notify = true) {
  if (!envStatus.value.winfsp_found) {
    showToast(t("msg.mount.needWinfsp"), "error");
    return;
  }
  if (!envStatus.value.rclone_found) {
    showToast(t("msg.mount.needRclone"), "error");
    return;
  }

  ensureRemoteMountOptions(remoteName);
  const conf = remoteConfigs[remoteName];
  if (!conf || !conf.driveLetter) {
    showToast(t("msg.mount.selectDrive"), "error");
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
      mountOptions: activeOpts,
      remotePath: (conf.remotePath || "").trim()
    });

    if (notify) {
      showToast(t("msg.mount.success", { name: remoteName, drive: conf.driveLetter }), "success");
    }
    await refreshAll();
  } catch (err) {
    showToast(t("msg.mount.failed", { error: err }), "error");
  } finally {
    loadingRemotes.delete(remoteName);
  }
}

// Unmount Remote
async function unmountDrive(remoteName) {
  loadingRemotes.add(remoteName);
  try {
    await invoke("unmount_remote", { remote: remoteName });
    showToast(t("msg.unmount.success", { name: remoteName }), "info");
    await refreshAll();
  } catch (err) {
    showToast(t("msg.unmount.failed", { error: err }), "error");
  } finally {
    loadingRemotes.delete(remoteName);
  }
}

// Open in File Explorer
async function openExplorer(driveLetter) {
  try {
    await invoke("open_in_explorer", { driveLetter });
  } catch (err) {
    showToast(t("msg.explorer.failed", { error: err }), "error");
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
    showToast(t("msg.cache.refreshFailed", { error: err }), "error");
  } finally {
    refreshingCacheRemotes.delete(remoteName);
  }
}

// Mount All (mounts unmounted drives in current sorted order)
async function mountAll() {
  const unmounted = sortedRemotes.value.filter((r) => !r.is_mounted);
  if (unmounted.length === 0) {
    showToast(t("msg.mountAll.none"), "info");
    return;
  }
  for (const r of unmounted) {
    await mountDrive(r.name, false);
  }
  showToast(t("msg.mountAll.done"), "success");
  await refreshAll();
}

// Unmount All
async function unmountAll() {
  try {
    const count = await invoke("unmount_all");
    showToast(t("msg.unmountAll.success", { count }), "info");
    await refreshAll();
  } catch (err) {
    showToast(t("msg.unmountAll.failed", { error: err }), "error");
  }
}

// GUI Add Remote
async function submitAddRemote() {
  const nameTrimmed = (newRemoteForm.name || "").trim();
  if (!nameTrimmed) {
    showToast(t("msg.remote.nameRequired"), "error");
    return;
  }
  if (/[\\/:*?"<>|\[\]]/.test(nameTrimmed)) {
    showToast(t("msg.remote.nameInvalid"), "error");
    return;
  }
  if (newRemoteForm.type === "openlist" && !(newRemoteForm.url || "").trim()) {
    showToast(t("msg.remote.openlistUrlRequired"), "error");
    return;
  }
  if (isChinaNetdiskType(newRemoteForm.type)) {
    if (!(newRemoteForm.user || "").trim()) {
      showToast(newRemoteForm.type === "openlist" ? t("msg.remote.openlistUserRequired") : t("msg.remote.netdiskUserRequired"), "error");
      return;
    }
    if (!(newRemoteForm.pass || "").trim()) {
      if (newRemoteForm.type === "nutstore") {
        showToast(t("msg.remote.nutstorePassRequired"), "error");
      } else if (newRemoteForm.type === "pan123") {
        showToast(t("msg.remote.pan123PassRequired"), "error");
      } else {
        showToast(t("msg.remote.netdiskPassRequired"), "error");
      }
      return;
    }
  }

  newRemoteForm.isCreating = true;
  const params = {};

  if (newRemoteForm.type === "pikpak") {
    params.user = newRemoteForm.user.trim();
    params.pass = newRemoteForm.pass;
    params.description = chinaNetdiskLabel("pikpak");
  } else if (newRemoteForm.type === "nutstore") {
    // 坚果云 WebDAV 地址固定，密码须使用「应用密码」
    params.url = "https://dav.jianguoyun.com/dav/";
    params.vendor = "other";
    params.user = newRemoteForm.user.trim();
    params.pass = newRemoteForm.pass;
    params.description = chinaNetdiskLabel("nutstore");
  } else if (newRemoteForm.type === "pan123") {
    // 123 云盘官方 WebDAV（VIP/SVIP），密码须使用「应用密码」
    params.url = "https://webdav.123pan.cn/webdav";
    params.vendor = "other";
    params.user = newRemoteForm.user.trim();
    params.pass = newRemoteForm.pass;
    params.description = chinaNetdiskLabel("pan123");
  } else if (newRemoteForm.type === "openlist") {
    params.url = normalizeWebdavUrl(newRemoteForm.url);
    params.vendor = "other";
    params.user = newRemoteForm.user.trim();
    params.pass = newRemoteForm.pass;
    params.description = chinaNetdiskLabel("openlist");
  } else if (isOAuthType(newRemoteForm.type)) {
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
    params.host = (newRemoteForm.host || "").trim();
    params.port = (newRemoteForm.port || "21").trim();
    params.user = newRemoteForm.user;
    params.pass = newRemoteForm.pass;
  } else if (newRemoteForm.type === "sftp") {
    params.host = (newRemoteForm.host || "").trim();
    params.port = (newRemoteForm.port || "22").trim();
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
    const backendType = resolveRcloneBackendType(newRemoteForm.type);
    const msg = await invoke("create_remote_gui", {
      rclonePath: customRclonePath.value.trim() || null,
      name: nameTrimmed,
      remoteType: backendType,
      params,
      nonInteractive: isChinaNetdiskType(newRemoteForm.type)
    });

    showToast(msg || t("msg.remote.createSuccess"), "success");
    showAddRemoteModal.value = false;
    const savedType = newRemoteForm.type;
    const savedPath = (newRemoteForm.remotePath || "").trim();
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
    newRemoteForm.remotePath = "";
    await refreshAll();
    if ((savedType === "ftp" || savedType === "sftp") && savedPath) {
      if (!remoteConfigs[nameTrimmed]) remoteConfigs[nameTrimmed] = {};
      remoteConfigs[nameTrimmed].remotePath = savedPath;
      saveRemoteConfigs();
    }
  } catch (err) {
    showToast(t("msg.remote.createFailed", { error: err }), "error");
  } finally {
    newRemoteForm.isCreating = false;
  }
}

// Open Edit Remote Modal
async function openEditModal(remote) {
  editRemoteForm.name = remote.name;
  editRemoteForm.newName = remote.name;
  editRemoteForm.type = remote.remote_type;
  editRemoteForm.description = remote.description || "";
  editRemoteForm.url = "";
  editRemoteForm.user = "";
  editRemoteForm.pass = "";
  editRemoteForm.host = "";
  editRemoteForm.port = remote.remote_type === "sftp" ? "22" : remote.remote_type === "smb" ? "445" : "21";
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
  // 远程访问目录保存在本地 localStorage（remoteConfigs），不在 rclone.conf 中
  editRemoteForm.remotePath = remoteConfigs[remote.name]?.remotePath || "";

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
    console.error("Failed to load remote details:", err);
  }

  showEditRemoteModal.value = true;
}

// Submit Edit Remote
async function submitEditRemote() {
  const trimmedNewName = (editRemoteForm.newName || "").trim();
  if (!trimmedNewName) {
    showToast(t("msg.remote.editNameRequired"), "error");
    return;
  }
  if (/[\\/:*?"<>|\[\]]/.test(trimmedNewName)) {
    showToast(t("msg.remote.nameInvalid"), "error");
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
  } else if (editRemoteForm.type === "pikpak") {
    if ((editRemoteForm.user || "").trim()) params.user = editRemoteForm.user.trim();
    if (editRemoteForm.pass) params.pass = editRemoteForm.pass;
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

    // 本地保存 FTP/SFTP 的访问目录（远程路径），不写入 rclone.conf
    if (editRemoteForm.type === "ftp" || editRemoteForm.type === "sftp") {
      if (!remoteConfigs[trimmedNewName]) remoteConfigs[trimmedNewName] = {};
      remoteConfigs[trimmedNewName].remotePath = (editRemoteForm.remotePath || "").trim();
      saveRemoteConfigs();
    }

    showToast(msg || t("msg.remote.updateSuccess"), "success");
    showEditRemoteModal.value = false;
    await refreshAll();
  } catch (err) {
    showToast(t("msg.remote.updateFailed", { error: err }), "error");
  } finally {
    editRemoteForm.isSaving = false;
  }
}

// Re-authenticate OAuth in Browser
async function handleReconnectRemote() {
  editRemoteForm.isReconnecting = true;
  try {
    showToast(t("msg.remote.reauthStarted"), "info");
    const msg = await invoke("reconnect_remote_gui", {
      rclonePath: customRclonePath.value.trim() || null,
      name: editRemoteForm.name
    });
    showToast(msg || t("msg.remote.reauthSuccess"), "success");
    await refreshAll();
  } catch (err) {
    showToast(t("msg.remote.reauthFailed", { error: err }), "error");
  } finally {
    editRemoteForm.isReconnecting = false;
  }
}

// Delete Remote
async function handleDeleteRemote(name) {
  if (!confirm(t("msg.remote.deleteConfirm", { name }))) return;
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
    showToast(t("msg.remote.deleteSuccess", { name }), "info");
    await refreshAll();
  } catch (err) {
    showToast(t("msg.remote.deleteFailed", { error: err }), "error");
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
    showToast(running ? t("msg.webgui.started") : t("msg.webgui.stopped"), "info");
  } catch (err) {
    showToast(t("msg.webgui.failed", { error: err }), "error");
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
      showToast(t("msg.browse.localSelected", { path: selected }), "success");
    }
  } catch (err) {
    showToast(t("msg.browse.localFailed", { error: err }), "error");
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
    showToast(t("msg.browse.noRemotes"), "error");
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
    showToast(t("msg.browse.listFailed", { error: err }), "error");
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
  showToast(t("msg.browse.cloudSelected", { path: finalPath }), "success");
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
    showToast(t("msg.sync.needPaths"), "error");
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
    showToast(t("msg.sync.diffFailed", { error: err }), "error");
  } finally {
    syncForm.isChecking = false;
  }
}

// Copy Selected Items
async function handleCopySelected() {
  if (syncForm.selectedItems.size === 0) {
    showToast(t("msg.sync.noFilesSelected"), "error");
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
    showToast(t("msg.sync.copyCountSuccess", { count: filesToCopy.length }), "success");
    syncForm.selectedItems.clear();
    await handleCheckDiff();
  } catch (err) {
    showToast(t("msg.sync.copyFailed", { error: err }), "error");
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
    showToast(t("msg.sync.copySingleSuccess", { path: filePath }), "success");
    await handleCheckDiff();
  } catch (err) {
    showToast(t("msg.sync.copyFailed", { error: err }), "error");
  } finally {
    syncForm.isCopyingSelected = false;
  }
}

// Open Schedule Modal or Batch Create from Sync Page
function openScheduleFromSync() {
  const allDests = getAllDestinations();
  if (!syncForm.source || allDests.length === 0) {
    showToast(t("msg.sync.needSourceAndDest"), "error");
    return;
  }
  const cleanSrc = syncForm.source.replace(/[\\/]+$/, "");
  const srcName = cleanSrc.split(/[\\/:]/).pop() || cleanSrc;

  if (allDests.length === 1) {
    const cleanDst = allDests[0].replace(/[\\/]+$/, "");
    const dstName = cleanDst.split(/[\\/:]/).pop() || cleanDst;
    newTask.name = syncForm.action === 'sync'
      ? t("msg.schedule.nameMirror", { src: srcName, dst: dstName })
      : t("msg.schedule.nameBackup", { src: srcName, dst: dstName });
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
        name: syncForm.action === 'sync'
          ? t("msg.schedule.nameSync", { src: srcName, dst: dstName })
          : t("msg.schedule.nameCopy", { src: srcName, dst: dstName }),
        source: syncForm.source.trim(),
        dest: d,
        action: syncForm.action,
        excludeFilter: syncForm.excludeFilter ? syncForm.excludeFilter.trim() : "",
        intervalMinutes: 60,
        enabled: true,
        lastRun: "",
        status: "idle"
      });
      addedCount++;
    }
    saveScheduledTasks();
    showToast(t("msg.schedule.batchCreated", { count: addedCount }), "success");
    activeTab.value = "scheduler";
  }
}

// RcloneView Plus Run Sync Job (Supports Multi-Destination)
async function handleRunSync() {
  const allDests = getAllDestinations();
  if (!syncForm.source || allDests.length === 0) {
    showToast(t("msg.sync.needSourceAndDest"), "error");
    return;
  }
  syncForm.isRunning = true;
  syncForm.taskLog = t("msg.sync.runningLog", { count: allDests.length });

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
      showToast(t("msg.sync.transferring", { prefix, dest: curDest }), "info");
      logs.push(`==================================================`);
      logs.push(t("msg.sync.logStart", { prefix, src: syncForm.source.trim(), dest: curDest }));
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
        logs.push(log || t("msg.sync.logDone"));
        successCount++;
      } catch (destErr) {
        logs.push(t("msg.sync.logDestFailed", { error: destErr }));
        failCount++;
      }
      syncForm.taskLog = logs.join("\n");
    }

    if (failCount === 0) {
      showToast(t("msg.sync.allSuccess", { count: successCount }), "success");
    } else {
      showToast(t("msg.sync.partial", { success: successCount, failed: failCount }), "warning");
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
            name: syncForm.action === 'sync'
              ? t("msg.schedule.nameAutoSync", { src: srcName, dst: dstName })
              : t("msg.schedule.nameAutoCopy", { src: srcName, dst: dstName }),
            source: syncForm.source.trim(),
            dest: curDest,
            action: syncForm.action,
            excludeFilter: syncForm.excludeFilter ? syncForm.excludeFilter.trim() : "",
            intervalMinutes: 60,
            enabled: true,
            lastRun: new Date().toLocaleTimeString(dateLocale()),
            lastRunTs: Date.now(),
            status: "success"
          };
          scheduledTasks.value.push(task);
          addedCount++;
        }
      }
      if (addedCount > 0) {
        saveScheduledTasks();
        showToast(t("msg.schedule.autoAdded", { count: addedCount }), "success");
      }
    }

    await handleCheckDiff();
  } catch (err) {
    syncForm.taskLog = t("msg.sync.overallError", { error: err });
    showToast(t("msg.sync.taskFailed", { error: err }), "error");
  } finally {
    syncForm.isRunning = false;
  }
}

// Scheduler: Add Task
function submitAddTask() {
  if (!newTask.name.trim() || !newTask.source.trim() || !newTask.dest.trim()) {
    showToast(t("msg.task.infoRequired"), "error");
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
    lastRun: "",
    status: "idle"
  };
  scheduledTasks.value.push(task);
  saveScheduledTasks();
  showAddTaskModal.value = false;
  newTask.name = "";
  newTask.source = "";
  newTask.dest = "";
  newTask.excludeFilter = "";
  showToast(t("msg.task.created"), "success");
}

function removeTask(id) {
  scheduledTasks.value = scheduledTasks.value.filter((t) => t.id !== id);
  saveScheduledTasks();
  showToast(t("msg.task.deleted"), "info");
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
    showToast(t("msg.task.infoRequired"), "error");
    return;
  }
  const task = scheduledTasks.value.find((t) => t.id === editTaskForm.id);
  if (!task) {
    showToast(t("msg.task.notFound"), "error");
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
  showToast(t("msg.task.updated"), "success");
}

async function executeTaskNow(task) {
  if (task.status === "running") {
    showToast(t("msg.task.alreadyRunning"), "info");
    return;
  }
  task.status = "running";
  task.lastRun = new Date().toLocaleTimeString(dateLocale());
  task.lastRunTs = Date.now();
  saveScheduledTasks();
  showToast(t("msg.task.starting", { name: task.name }), "info");
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
    task.status = "success";
    saveScheduledTasks();
    showToast(t("msg.task.runSuccess", { name: task.name }), "success");
  } catch (err) {
    task.status = "failed";
    saveScheduledTasks();
    showToast(t("msg.task.runFailed", { name: task.name, error: err }), "error");
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
      task.status = "running";
      task.lastRunTs = now;
      task.lastRun = new Date().toLocaleTimeString(dateLocale());
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
        task.status = "success";
      } catch (err) {
        task.status = "failed";
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
  showToast(t("msg.settings.pathSaved"), "success");
  refreshAll();
}

const isInstallingRclone = ref(false);
const isInstallingWinFsp = ref(false);

async function handleAutoInstallRclone() {
  if (isInstallingRclone.value) return;
  isInstallingRclone.value = true;
  showToast(t("msg.rclone.installing"), "info");
  try {
    const installedPath = await invoke("auto_install_rclone");
    customRclonePath.value = installedPath;
    localStorage.setItem("rclone_custom_path", installedPath);
    showToast(t("msg.rclone.installSuccess", { path: installedPath }), "success");
    await refreshAll();
  } catch (err) {
    showToast(t("msg.rclone.installFailed", { error: err }), "error");
  } finally {
    isInstallingRclone.value = false;
  }
}

async function handleAutoInstallWinFsp() {
  if (isInstallingWinFsp.value) return;
  isInstallingWinFsp.value = true;
  showToast(t("msg.winfsp.installing"), "info");
  try {
    await invoke("auto_install_winfsp");
    showToast(t("msg.winfsp.installStarted"), "success");
    await refreshAll();
  } catch (err) {
    showToast(t("msg.winfsp.installFailed", { error: err }), "error");
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

watch(locale, (value) => {
  setLocale(value);
});

onMounted(async () => {
  setLocale(locale.value);
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
            <span class="app-version-badge" @click="checkForUpdates(true)" :title="$t('ui.header.currentVersion', { version: CURRENT_VERSION })">
              v{{ CURRENT_VERSION }}
            </span>
          </div>
          <p class="brand-subtitle">{{ $t('ui.header.subtitle') }}</p>
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
          <span>{{ $t('ui.header.tabMounts') }}</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'sync' }"
          @click="activeTab = 'sync'"
        >
          <ArrowRightLeft class="tab-icon" />
          <span>{{ $t('ui.header.tabSync') }}</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'scheduler' }"
          @click="activeTab = 'scheduler'"
        >
          <CalendarClock class="tab-icon" />
          <span>{{ $t('ui.header.tabScheduler', { count: scheduledTasks.length }) }}</span>
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
          :title="$t('ui.header.checkGithubUpdate')"
        >
          <DownloadCloud class="btn-icon" :class="{ 'spin-anim': isCheckingUpdate }" />
          <span class="btn-text-hide-sm">{{ $t('ui.header.checkUpdate') }}</span>
        </button>

        <button class="btn btn-secondary" @click="toggleTheme" :title="isLightMode ? $t('ui.header.switchDark') : $t('ui.header.switchLight')">
          <Sun v-if="isLightMode" class="btn-icon text-amber" />
          <Moon v-else class="btn-icon" />
        </button>

        <button class="btn btn-secondary" @click="refreshAll(false)" :disabled="isRefreshing" :title="$t('common.refresh')">
          <RefreshCw class="btn-icon" :class="{ 'spin-anim': isRefreshing }" />
        </button>

        <button class="btn btn-secondary" @click="showSettings = true" :title="$t('ui.header.preferences')">
          <Settings class="btn-icon" />
        </button>
      </div>
    </header>

    <!-- Missing Prerequisites Warning Banner -->
    <div v-if="isPrerequisiteMissing" class="prereq-alert-banner">
      <div class="prereq-content">
        <div class="prereq-header">
          <AlertTriangle class="prereq-warn-icon" />
          <span class="prereq-title">{{ $t('ui.env.missingTitle') }}</span>
          <button
            v-if="!envStatus.rclone_found && !envStatus.winfsp_found"
            class="btn btn-emerald btn-sm ml-auto"
            :disabled="isInstallingRclone || isInstallingWinFsp"
            @click="handleAutoInstallAll"
          >
            <Zap class="btn-icon" />
            <span>{{ $t('ui.env.installAll') }}</span>
          </button>
        </div>

        <div class="prereq-cards-row">
          <!-- Rclone Missing Card -->
          <div v-if="!envStatus.rclone_found" class="prereq-item-card">
            <div class="prereq-card-text">
              <span class="prereq-badge">{{ $t('ui.env.componentBadge1') }}</span>
              <h4>{{ $t('ui.env.rcloneTitle') }}</h4>
              <p>{{ $t('ui.env.rclonePathPrefix') }} <code>C:\rclone\rclone.exe</code> {{ $t('ui.env.rclonePathSuffix') }}</p>
            </div>
            <div class="prereq-btn-group">
              <button
                class="btn btn-download"
                :disabled="isInstallingRclone"
                @click="handleAutoInstallRclone"
              >
                <DownloadCloud class="btn-icon" :class="{ 'spin-anim': isInstallingRclone }" />
                <span>{{ isInstallingRclone ? $t('ui.env.installingRclone') : $t('ui.env.installRclone') }}</span>
              </button>
              <button class="btn btn-download-alt" @click="openUrl('https://rclone.org/downloads/')">
                <ExternalLink class="btn-icon" />
                <span>{{ $t('ui.env.manualDownload') }}</span>
              </button>
            </div>
          </div>

          <!-- WinFsp Missing Card -->
          <div v-if="!envStatus.winfsp_found" class="prereq-item-card">
            <div class="prereq-card-text">
              <span class="prereq-badge">{{ $t('ui.env.componentBadge2') }}</span>
              <h4>{{ $t('ui.env.winfspTitle') }}</h4>
              <p>{{ $t('ui.env.winfspDesc') }}</p>
            </div>
            <div class="prereq-btn-group">
              <button
                class="btn btn-download"
                :disabled="isInstallingWinFsp"
                @click="handleAutoInstallWinFsp"
              >
                <DownloadCloud class="btn-icon" :class="{ 'spin-anim': isInstallingWinFsp }" />
                <span>{{ isInstallingWinFsp ? $t('ui.env.installingWinFsp') : $t('ui.env.installWinFsp') }}</span>
              </button>
              <button class="btn btn-download-alt" @click="openUrl('https://winfsp.dev/')">
                <ExternalLink class="btn-icon" />
                <span>{{ $t('ui.env.manualDownload') }}</span>
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
        <span v-if="envStatus.rclone_found">Rclone: {{ envStatus.rclone_version ? (envStatus.rclone_version.toLowerCase().startsWith('rclone') ? envStatus.rclone_version.replace(/^rclone\s*/i, '') : envStatus.rclone_version) : $t('ui.env.connected') }}</span>
        <span v-else class="clickable-link" @click="handleAutoInstallRclone" :title="$t('ui.env.rcloneInstallTip')">
          {{ $t('ui.env.rcloneNotInstalled') }}
        </span>
      </div>

      <div class="env-item" :class="{ 'env-ok': envStatus.winfsp_found, 'env-warn': !envStatus.winfsp_found }">
        <component :is="envStatus.winfsp_found ? ShieldCheck : AlertTriangle" class="env-icon" />
        <span v-if="envStatus.winfsp_found">{{ $t('ui.env.winfspReady') }}</span>
        <span v-else class="clickable-link" @click="handleAutoInstallWinFsp" :title="$t('ui.env.winfspInstallTip')">
          {{ $t('ui.env.winfspNotInstalled') }}
        </span>
      </div>

      <div class="env-item" :class="{ 'env-ok': envStatus.webgui_running, 'env-neutral': !envStatus.webgui_running }">
        <Globe class="env-icon" />
        <span>Web-GUI: {{ envStatus.webgui_running ? $t('ui.env.webguiRunning') : $t('ui.env.webguiStopped') }}</span>
      </div>

      <div class="env-item env-neutral" v-if="autostartActive">
        <Check class="env-icon text-emerald" />
        <span>{{ $t('ui.env.autostartEnabled') }}</span>
      </div>

      <div class="env-item env-neutral ml-auto">
        <span class="count-pill">
          <span class="indicator-dot active"></span>
          {{ $t('ui.env.mountedCount', { mounted: mountedCount, total: totalCount }) }}
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
            <h2>{{ $t('ui.mount.listTitle') }}</h2>
            <p>{{ $t('ui.mount.listSubtitle') }}</p>
          </div>
          <div class="sub-actions">
            <!-- Sort Controls -->
            <div v-if="remotes.length > 0" class="sort-select-wrapper" :title="$t('ui.mount.sortTitle')">
              <ArrowUpDown class="sort-icon" />
              <span class="sort-label">{{ $t('ui.mount.sortLabel') }}</span>
              <select v-model="mountSortBy" @change="onSortChange" class="sort-select">
                <option value="default">{{ $t('ui.mount.sortDefault') }}</option>
                <option value="custom">{{ $t('ui.mount.sortCustom') }}</option>
                <option value="name-asc">{{ $t('ui.mount.sortNameAsc') }}</option>
                <option value="name-desc">{{ $t('ui.mount.sortNameDesc') }}</option>
                <option value="drive-asc">{{ $t('ui.mount.sortDriveAsc') }}</option>
                <option value="drive-desc">{{ $t('ui.mount.sortDriveDesc') }}</option>
                <option value="mounted-first">{{ $t('ui.mount.sortMountedFirst') }}</option>
                <option value="unmounted-first">{{ $t('ui.mount.sortUnmountedFirst') }}</option>
                <option value="type">{{ $t('ui.mount.sortType') }}</option>
              </select>
            </div>

            <button class="btn btn-primary" @click="showAddRemoteModal = true">
              <PlusCircle class="btn-icon" />
              <span>{{ $t('ui.mount.addDrive') }}</span>
            </button>
            <button class="btn btn-secondary" @click="mountAll" :disabled="mountedCount === totalCount || totalCount === 0 || isPrerequisiteMissing">
              <Disc3 class="btn-icon" />
              <span>{{ $t('ui.mount.mountAll') }}</span>
            </button>
            <button class="btn btn-danger-outline" @click="unmountAll" :disabled="mountedCount === 0">
              <Power class="btn-icon" />
              <span>{{ $t('ui.mount.unmountAll') }}</span>
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
              <div class="provider-badge" :style="{ backgroundColor: getProviderDetails(remote.remote_type, remote.description).bg }">
                <Cloud class="provider-icon" :style="{ color: getProviderDetails(remote.remote_type, remote.description).color }" />
              </div>

              <div class="remote-meta">
                <div class="remote-name" :title="remote.name">{{ remote.name }}</div>
                <div class="remote-type-tag">
                  {{ providerDetailName(remote.remote_type, remote.description) }}
                </div>
              </div>

              <div class="mount-status-badge" :class="remote.is_mounted ? 'status-mounted' : 'status-unmounted'">
                <span class="status-dot"></span>
                {{ remote.is_mounted ? $t('ui.mount.mountedWithDrive', { drive: remote.mounted_drive }) : $t('ui.mount.unmounted') }}
              </div>

              <!-- Reorder & Action Buttons -->
              <div class="card-header-actions">
                <div class="reorder-btns" :title="$t('ui.mount.reorderTip')">
                  <button
                    class="icon-btn-action icon-btn-reorder"
                    :disabled="index === 0"
                    @click.stop="moveRemote(remote.name, -1)"
                    :title="$t('ui.mount.moveUp')"
                  >
                    <ArrowUp class="action-icon" />
                  </button>
                  <button
                    class="icon-btn-action icon-btn-reorder"
                    :disabled="index === sortedRemotes.length - 1"
                    @click.stop="moveRemote(remote.name, 1)"
                    :title="$t('ui.mount.moveDown')"
                  >
                    <ArrowDown class="action-icon" />
                  </button>
                </div>

                <template v-if="!remote.is_mounted">
                  <button
                    class="icon-btn-action"
                    @click="openEditModal(remote)"
                    :title="$t('ui.mount.editDriveTip')"
                  >
                    <Pencil class="action-icon" />
                  </button>
                  <button
                    class="icon-btn-delete"
                    @click="handleDeleteRemote(remote.name)"
                    :title="$t('ui.mount.deleteDriveTip')"
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
                <label class="field-label">{{ $t('ui.mount.driveLetter') }}</label>
                <div class="drive-select-wrapper">
                  <select
                    v-if="!remote.is_mounted"
                    v-model="remoteConfigs[remote.name].driveLetter"
                    @change="saveRemoteConfigs"
                    class="drive-select"
                  >
                    <option v-for="letter in availableDrives" :key="letter" :value="letter">
                      {{ $t('ui.mount.disk', { letter }) }}
                    </option>
                    <option v-if="!availableDrives.includes(remoteConfigs[remote.name]?.driveLetter)" :value="remoteConfigs[remote.name]?.driveLetter">
                      {{ $t('ui.mount.disk', { letter: remoteConfigs[remote.name]?.driveLetter }) }}
                    </option>
                  </select>
                  <div v-else class="drive-locked">
                    <HardDrive class="drive-letter-icon" />
                    <span>{{ $t('ui.mount.disk', { letter: remote.mounted_drive }) }}</span>
                  </div>
                </div>
              </div>

              <!-- Volume Name -->
              <div class="setting-row" v-if="!remote.is_mounted">
                <label class="field-label">{{ $t('ui.mount.volumeName') }}</label>
                <input
                  type="text"
                  v-model="remoteConfigs[remote.name].volname"
                  @change="saveRemoteConfigs"
                  @blur="saveRemoteConfigs"
                  class="field-input"
                  :placeholder="$t('ui.mount.volumePlaceholder')"
                />
              </div>

              <!-- Cache Mode -->
              <div class="setting-row" v-if="!remote.is_mounted">
                <label class="field-label">{{ $t('ui.mount.cacheMode') }}</label>
                <select
                  v-model="remoteConfigs[remote.name].cacheMode"
                  @change="saveRemoteConfigs"
                  class="field-select"
                >
                  <option value="full">{{ $t('ui.mount.cacheFull') }}</option>
                  <option value="writes">{{ $t('ui.mount.cacheWrites') }}</option>
                  <option value="minimal">{{ $t('ui.mount.cacheMinimal') }}</option>
                  <option value="off">{{ $t('ui.mount.cacheOff') }}</option>
                </select>
              </div>

              <!-- Performance Preset Selector -->
              <div class="setting-row" v-if="!remote.is_mounted">
                <div class="perf-preset-header">
                  <label class="field-label">
                    <span>{{ $t('ui.mount.presetLabel') }}</span>
                  </label>
                  <button
                    type="button"
                    class="btn-toggle-adv"
                    :class="{ active: expandedAdvancedOpts[remote.name] }"
                    @click="toggleAdvancedOpts(remote.name)"
                    :title="$t('ui.mount.toggleAdvTip')"
                  >
                    <SlidersHorizontal class="btn-adv-icon" />
                    <span>{{ expandedAdvancedOpts[remote.name] ? $t('ui.mount.collapseAdv') : $t('ui.mount.expandAdv') }}</span>
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
                    <span>{{ $t('ui.mount.presetFast') }}</span>
                  </button>
                  <button
                    type="button"
                    class="preset-pill"
                    :class="{ active: remoteConfigs[remote.name]?.mountPreset === 'default' }"
                    @click="applyPresetToRemote(remote.name, 'default')"
                  >
                    <Gauge class="pill-icon" />
                    <span>{{ $t('ui.mount.presetDefault') }}</span>
                  </button>
                  <button
                    type="button"
                    class="preset-pill"
                    :class="{ active: remoteConfigs[remote.name]?.mountPreset === 'custom' }"
                    @click="applyPresetToRemote(remote.name, 'custom')"
                  >
                    <Sliders class="pill-icon" />
                    <span>{{ $t('ui.mount.presetCustom') }}</span>
                  </button>
                </div>

                <div class="preset-hint-box" v-if="!expandedAdvancedOpts[remote.name]">
                  <p v-if="(remoteConfigs[remote.name]?.mountPreset || 'fast') === 'fast'" class="hint-fast" v-html="$t('ui.mount.hintFast')"></p>
                  <p v-else-if="remoteConfigs[remote.name]?.mountPreset === 'default'" class="hint-default" v-html="$t('ui.mount.hintDefault')"></p>
                  <p v-else class="hint-custom" v-html="$t('ui.mount.hintCustom')"></p>
                </div>
              </div>

              <!-- Expanded Advanced Performance Options -->
              <div
                class="advanced-opts-panel"
                v-if="!remote.is_mounted && expandedAdvancedOpts[remote.name] && remoteConfigs[remote.name]?.mountOptions"
              >
                <div class="adv-panel-title">
                  <SlidersHorizontal class="panel-title-icon" />
                  <span>{{ $t('ui.mount.advPanelTitle') }}</span>
                </div>

                <!-- 1. 目录与属性缓存 -->
                <div class="adv-section-title">{{ $t('ui.mount.advSection1') }}</div>
                <div class="adv-grid">
                  <div class="adv-field">
                    <label class="adv-label" title="--dir-cache-time">{{ $t('ui.mount.dirCacheTime') }}</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.dirCacheTime"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="72h">{{ $t('ui.mount.dirCache72h') }}</option>
                      <option value="24h">{{ $t('ui.mount.time24h') }}</option>
                      <option value="7d">{{ $t('ui.mount.dirCache7d') }}</option>
                      <option value="1h">{{ $t('ui.mount.time1h') }}</option>
                      <option value="5m">{{ $t('ui.mount.dirCache5m') }}</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--poll-interval">{{ $t('ui.mount.pollLabel') }}</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.pollInterval"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="1m">{{ $t('ui.mount.poll1m') }}</option>
                      <option value="30s">{{ $t('ui.mount.poll30s') }}</option>
                      <option value="5m">{{ $t('ui.mount.time5m') }}</option>
                      <option value="0">{{ $t('ui.mount.pollOff') }}</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--attr-timeout">{{ $t('ui.mount.attrLabel') }}</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.attrTimeout"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="10m">{{ $t('ui.mount.attr10m') }}</option>
                      <option value="5m">{{ $t('ui.mount.time5m') }}</option>
                      <option value="1h">{{ $t('ui.mount.time1h') }}</option>
                      <option value="1s">{{ $t('ui.mount.attr1s') }}</option>
                    </select>
                  </div>

                  <div class="adv-field-toggle">
                    <div class="toggle-info">
                      <span class="adv-toggle-label" title="--no-modtime">{{ $t('ui.mount.noModtimeLabel') }}</span>
                      <span class="adv-toggle-desc">{{ $t('ui.mount.noModtimeDesc') }}</span>
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
                <div class="adv-section-title">{{ $t('ui.mount.advSection2') }}</div>
                <div class="adv-grid">
                  <div class="adv-field">
                    <label class="adv-label" title="--vfs-cache-max-size">{{ $t('ui.mount.vfsCacheMaxSize') }}</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.vfsCacheMaxSize"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="50G">{{ $t('ui.mount.vfsSize50g') }}</option>
                      <option value="20G">{{ $t('ui.mount.vfsSize20g') }}</option>
                      <option value="100G">{{ $t('ui.mount.vfsSize100g') }}</option>
                      <option value="off">{{ $t('ui.mount.vfsSizeOff') }}</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--vfs-cache-max-age">{{ $t('ui.mount.vfsCacheMaxAge') }}</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.vfsCacheMaxAge"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="24h">{{ $t('ui.mount.vfsAge24h') }}</option>
                      <option value="48h">{{ $t('ui.mount.vfsAge48h') }}</option>
                      <option value="7d">{{ $t('ui.mount.time7d') }}</option>
                      <option value="1h">{{ $t('ui.mount.time1h') }}</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--vfs-read-chunk-size">{{ $t('ui.mount.chunkSize') }}</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.vfsReadChunkSize"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="64M">{{ $t('ui.mount.chunk64m') }}</option>
                      <option value="32M">{{ $t('ui.mount.chunk32m') }}</option>
                      <option value="128M">{{ $t('ui.mount.chunk128m') }}</option>
                      <option value="0">{{ $t('ui.mount.chunkOff') }}</option>
                    </select>
                  </div>

                  <div class="adv-field">
                    <label class="adv-label" title="--vfs-read-chunk-size-limit">{{ $t('ui.mount.chunkLimit') }}</label>
                    <select
                      v-model="remoteConfigs[remote.name].mountOptions.vfsReadChunkSizeLimit"
                      @change="onCustomMountOptionChange(remote.name)"
                      class="adv-select"
                    >
                      <option value="1G">{{ $t('ui.mount.limit1g') }}</option>
                      <option value="2G">{{ $t('ui.mount.limit2g') }}</option>
                      <option value="off">{{ $t('ui.mount.limitOff') }}</option>
                    </select>
                  </div>

                  <div class="adv-field-toggle">
                    <div class="toggle-info">
                      <span class="adv-toggle-label" title="--drive-pacer-min-sleep 10ms --drive-pacer-burst 200">{{ $t('ui.mount.pacerLabel') }}</span>
                      <span class="adv-toggle-desc">{{ $t('ui.mount.pacerDesc') }}</span>
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
                <div class="adv-section-title">{{ $t('ui.mount.advSection3') }}</div>
                <div class="adv-grid">
                  <div class="adv-field-toggle">
                    <div class="toggle-info">
                      <span class="adv-toggle-label">{{ $t('ui.mount.warmupLabel') }}</span>
                      <span class="adv-toggle-desc">{{ $t('ui.mount.warmupDesc') }}</span>
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
                    <label class="adv-label">{{ $t('ui.mount.extraFlags') }}</label>
                    <input
                      type="text"
                      v-model="remoteConfigs[remote.name].mountOptions.extraFlags"
                      @input="onCustomMountOptionChange(remote.name)"
                      class="adv-input"
                      :placeholder="$t('ui.mount.extraFlagsPlaceholder')"
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
                    <span>{{ $t('ui.mount.resetToFast') }}</span>
                  </button>
                </div>
              </div>

              <!-- Mounted Status Badge -->
              <div class="mounted-perf-badge" v-if="remote.is_mounted">
                <Zap class="perf-badge-icon" />
                <span>{{ $t('ui.mount.perfBadge') }}{{ (remoteConfigs[remote.name]?.mountPreset || 'fast') === 'fast' ? $t('ui.mount.perfFast') : remoteConfigs[remote.name]?.mountPreset === 'default' ? $t('ui.mount.perfDefault') : $t('ui.mount.perfCustom') }}</span>
              </div>

              <div class="checkbox-row" @click="toggleRemoteAutoMount(remote.name)">
                <div class="custom-checkbox" :class="{ checked: remoteConfigs[remote.name]?.autoMount }">
                  <Check v-if="remoteConfigs[remote.name]?.autoMount" class="check-icon" />
                </div>
                <span class="checkbox-label">{{ $t('ui.mount.autoMountLabel') }}</span>
              </div>
            </div>

            <!-- Card Footer -->
            <div class="card-footer">
              <template v-if="remote.is_mounted">
                <button
                  class="btn btn-emerald"
                  @click="openExplorer(remote.mounted_drive)"
                  :title="$t('ui.mount.openDriveTip')"
                >
                  <FolderOpen class="btn-icon" />
                  <span>{{ $t('ui.mount.openExplorer') }}</span>
                </button>

                <button
                  class="btn btn-cache-refresh"
                  @click="vfsRefreshCache(remote.name)"
                  :disabled="refreshingCacheRemotes.has(remote.name)"
                  :title="$t('ui.mount.refreshCacheTip')"
                >
                  <FolderSync class="btn-icon" :class="{ 'spin-anim': refreshingCacheRemotes.has(remote.name) }" />
                  <span>{{ refreshingCacheRemotes.has(remote.name) ? $t('ui.mount.refreshing') : $t('ui.mount.refreshCache') }}</span>
                </button>

                <button
                  class="btn btn-danger"
                  @click="unmountDrive(remote.name)"
                  :disabled="loadingRemotes.has(remote.name)"
                  :title="$t('ui.mount.unmountTip')"
                >
                  <Power class="btn-icon" />
                  <span>{{ loadingRemotes.has(remote.name) ? $t('ui.mount.unmounting') : $t('ui.mount.unmount') }}</span>
                </button>
              </template>

              <template v-else>
                <button
                  class="btn btn-mount-primary"
                  @click="mountDrive(remote.name)"
                  :disabled="loadingRemotes.has(remote.name) || isPrerequisiteMissing"
                >
                  <Disc3 class="btn-icon" :class="{ 'spin-anim': loadingRemotes.has(remote.name) }" />
                  <span>{{ loadingRemotes.has(remote.name) ? $t('ui.mount.mounting') : $t('ui.mount.mountNow') }}</span>
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
          <h2>{{ $t('ui.mount.emptyTitle') }}</h2>
          <p>{{ $t('ui.mount.emptyDesc') }}</p>
          <button class="btn btn-primary btn-lg" @click="showAddRemoteModal = true">
            <PlusCircle class="btn-icon" />
            <span>{{ $t('ui.mount.addDrive') }}</span>
          </button>
        </div>
      </section>

      <!-- TAB 2: SYNC & COMPARE (RcloneView Plus) -->
      <section v-if="activeTab === 'sync'" class="tab-pane">
        <div class="sub-bar">
          <div class="sub-title-group">
            <h2>{{ $t('ui.sync.title') }}</h2>
            <p>{{ $t('ui.sync.subtitle') }}</p>
          </div>
        </div>

        <!-- Upper: Task Setup Card (上下排列之上方卡片) -->
        <div class="glass-card setup-card-compact">
          <div class="setup-compact-header">
            <div class="setup-compact-title">
              <FolderSync class="card-title-icon" />
              <span>{{ $t('ui.sync.setupTitle') }}</span>
            </div>
            <div class="setup-compact-actions">
              <button
                class="btn btn-secondary"
                @click="handleCheckDiff"
                :disabled="syncForm.isChecking || syncForm.isRunning || isPrerequisiteMissing"
              >
                <FileCheck class="btn-icon" :class="{ 'spin-anim': syncForm.isChecking }" />
                <span>{{ syncForm.isChecking ? $t('ui.sync.checking') : $t('ui.sync.checkDiff') }}</span>
              </button>

              <button
                class="btn btn-primary"
                @click="handleRunSync"
                :disabled="syncForm.isRunning || syncForm.isChecking || isPrerequisiteMissing"
              >
                <Play class="btn-icon" :class="{ 'spin-anim': syncForm.isRunning }" />
                <span>{{ syncForm.isRunning ? $t('ui.sync.running') : $t('ui.sync.runNow') }}</span>
              </button>

              <button
                class="btn btn-schedule"
                @click="openScheduleFromSync"
                :disabled="!syncForm.source || !syncForm.dest"
                :title="$t('ui.sync.scheduleTip')"
              >
                <CalendarClock class="btn-icon" />
                <span>{{ $t('ui.sync.addToScheduler') }}</span>
              </button>
            </div>
          </div>

          <!-- Path Inputs Row -->
          <div class="setup-inputs-grid">
            <!-- Source Input -->
            <div class="form-group-compact">
              <div class="field-label-row">
                <label class="field-label">{{ $t('ui.sync.sourceLabel') }}</label>
                <div class="quick-links-group" v-if="remotes.length > 0">
                  <span class="quick-link-label">{{ $t('ui.sync.quickCloud') }}</span>
                  <button
                    v-for="r in remotes.slice(0, 3)"
                    :key="r.name"
                    class="btn-tag"
                    @click="pickRemoteDirect(r.name, 'source')"
                    :title="$t('ui.sync.pickSourceTip', { name: r.name })"
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
                  :placeholder="$t('ui.sync.sourcePlaceholder')"
                />
                <button
                  class="btn btn-browse"
                  @click="pickLocalFolder('source')"
                  :title="$t('ui.sync.browseLocalTip')"
                >
                  <FolderOpen class="btn-icon" />
                  <span>{{ $t('ui.sync.browseLocal') }}</span>
                </button>
                <button
                  class="btn btn-browse-cloud"
                  @click="openCloudBrowseModal('source')"
                  :title="$t('ui.sync.browseCloudTip')"
                >
                  <Cloud class="btn-icon" />
                  <span>{{ $t('ui.sync.browseCloud') }}</span>
                </button>
              </div>
            </div>

            <!-- Destination Column (Right Column: Primary + Extras + Add Button) -->
            <div class="destinations-col">
              <!-- Destination Input (Primary) -->
              <div class="form-group-compact">
                <div class="field-label-row">
                  <div class="dest-label-with-tag">
                    <label class="field-label">{{ $t('ui.sync.destMainLabel') }}</label>
                    <span class="badge-tag">{{ $t('ui.sync.badgeMain') }}</span>
                  </div>
                  <div class="quick-links-group" v-if="remotes.length > 0">
                    <span class="quick-link-label">{{ $t('ui.sync.quickCloud') }}</span>
                    <button
                      v-for="r in remotes.slice(0, 3)"
                      :key="r.name"
                      class="btn-tag"
                      @click="pickRemoteDirect(r.name, 'dest')"
                      :title="$t('ui.sync.pickDestTip', { name: r.name })"
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
                    :placeholder="$t('ui.sync.destPlaceholder')"
                  />
                  <button
                    class="btn btn-browse"
                    @click="pickLocalFolder('dest')"
                    :title="$t('ui.sync.browseLocalTip')"
                  >
                    <FolderOpen class="btn-icon" />
                    <span>{{ $t('ui.sync.browseLocal') }}</span>
                  </button>
                  <button
                    class="btn btn-browse-cloud"
                    @click="openCloudBrowseModal('dest')"
                    :title="$t('ui.sync.browseCloudTip')"
                  >
                    <Cloud class="btn-icon" />
                    <span>{{ $t('ui.sync.browseCloud') }}</span>
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
                    <label class="field-label">{{ $t('ui.sync.destExtraLabel', { n: idx + 2 }) }}</label>
                    <span class="badge-tag badge-cyan">{{ $t('ui.sync.badgeExtra') }}</span>
                  </div>
                  <div class="quick-links-group" v-if="remotes.length > 0">
                    <span class="quick-link-label">{{ $t('ui.sync.quickCloud') }}</span>
                    <button
                      v-for="r in remotes.slice(0, 3)"
                      :key="r.name"
                      class="btn-tag"
                      @click="pickRemoteDirect(r.name, 'extraDest', idx)"
                      :title="$t('ui.sync.pickExtraDestTip', { name: r.name })"
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
                    :placeholder="$t('ui.sync.extraDestPlaceholder', { n: idx + 2 })"
                  />
                  <button
                    class="btn btn-browse"
                    @click="pickLocalFolder('extraDest', idx)"
                    :title="$t('ui.sync.browseLocalTip')"
                  >
                    <FolderOpen class="btn-icon" />
                    <span>{{ $t('ui.sync.browseLocal') }}</span>
                  </button>
                  <button
                    class="btn btn-browse-cloud"
                    @click="openCloudBrowseModal('extraDest', idx)"
                    :title="$t('ui.sync.browseCloudTip')"
                  >
                    <Cloud class="btn-icon" />
                    <span>{{ $t('ui.sync.browseCloud') }}</span>
                  </button>
                  <button
                    class="btn btn-danger-outline"
                    @click="removeExtraDestination(idx)"
                    :title="$t('ui.sync.removeDestTip')"
                  >
                    <Trash2 class="btn-icon" />
                    <span>{{ $t('common.remove') }}</span>
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
                  <span>{{ $t('ui.sync.addDestination') }}</span>
                </button>
                <span class="dest-count-hint" v-if="syncForm.extraDests && syncForm.extraDests.length > 0">
                  {{ $t('ui.sync.destCountHint', { count: (syncForm.extraDests ? syncForm.extraDests.length : 0) + 1 }) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Secondary Options Row (Action, Filters, Auto-Schedule) -->
          <div class="setup-options-row">
            <div class="option-item flex-2">
              <label class="field-label-compact">{{ $t('ui.sync.actionLabel') }}</label>
              <select v-model="syncForm.action" class="modal-input-compact">
                <option value="copy">{{ $t('ui.sync.actionCopy') }}</option>
                <option value="sync">{{ $t('ui.sync.actionSync') }}</option>
                <option value="move">{{ $t('ui.sync.actionMove') }}</option>
              </select>
            </div>

            <div class="option-item flex-3">
              <label class="field-label-compact">{{ $t('ui.sync.filterLabel') }}</label>
              <input
                type="text"
                v-model="syncForm.excludeFilter"
                class="modal-input-compact"
                :placeholder="$t('ui.sync.filterPlaceholder')"
              />
            </div>

            <div class="option-item flex-2 checkbox-center" @click="syncForm.autoAddToScheduler = !syncForm.autoAddToScheduler">
              <div class="custom-checkbox" :class="{ checked: syncForm.autoAddToScheduler }">
                <Check v-if="syncForm.autoAddToScheduler" class="check-icon" />
              </div>
              <span class="checkbox-label text-cyan font-medium text-xs">
                {{ $t('ui.sync.autoScheduleLabel') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Lower: RcloneView Full Width Compare Card (上下排列之全宽比对查看窗口) -->
        <div class="glass-card rcloneview-main-card">
          <!-- Top Header: Compare Status & Reload -->
          <div class="rcloneview-header">
            <div class="rcloneview-title-group">
              <h3 class="rcloneview-title">{{ $t('ui.sync.compareTitle') }}</h3>
              <span v-if="syncForm.diffResult" class="rcloneview-count-badge">
                All data retrieved ({{ syncForm.diffResult.items ? syncForm.diffResult.items.length : 0 }} / {{ syncForm.diffResult.items ? syncForm.diffResult.items.length : 0 }} compared)
              </span>
            </div>
            <div class="rcloneview-header-right">
              <button
                v-if="syncForm.diffResult"
                class="btn btn-xs btn-schedule-outline"
                @click="openScheduleFromSync"
                :title="$t('ui.sync.createScheduleTip')"
              >
                <CalendarClock class="btn-icon-xs" />
                <span>{{ $t('ui.sync.createSchedule') }}</span>
              </button>
              <button
                class="btn btn-xs btn-outline"
                @click="handleCheckDiff"
                :disabled="syncForm.isChecking || !syncForm.source || !syncForm.dest"
                :title="$t('ui.sync.reloadTip')"
              >
                <RefreshCw class="btn-icon-xs" :class="{ 'spin-anim': syncForm.isChecking }" />
                <span>{{ syncForm.isChecking ? $t('ui.sync.checking') : $t('ui.sync.reload') }}</span>
              </button>
            </div>
          </div>

          <!-- RcloneView Blue Path Indicator Bar (如 RcloneView 截屏之顶部路径条) -->
          <div class="rcloneview-path-header">
            <div class="path-col path-src" :title="syncForm.source || $t('ui.sync.noSource')">
              <span class="path-star">⭐</span>
              <span class="path-name">{{ syncForm.source || $t('ui.sync.specifySource') }}</span>
              <Folder class="path-icon-right" />
            </div>
            <div class="path-col path-dest" :title="syncForm.dest || $t('ui.sync.noDest')">
              <span class="path-triangle">☁️</span>
              <span class="path-name">{{ syncForm.dest || $t('ui.sync.specifyDest') }}</span>
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
                :title="$t('ui.sync.tipSourceOnly')"
              >
                <ArrowRight class="rv-icon text-green" />
                <span>{{ $t('ui.sync.sourceOnly', { count: syncForm.diffResult?.total_source_files || 0 }) }}</span>
              </button>

              <button
                class="rv-toggle-btn toggle-dest"
                :class="{ active: syncForm.filterModes.dest_only }"
                @click="toggleFilterMode('dest_only')"
                :title="$t('ui.sync.tipDestOnly')"
              >
                <ArrowLeft class="rv-icon text-blue" />
                <span>{{ $t('ui.sync.destOnly', { count: syncForm.diffResult?.total_dest_files || 0 }) }}</span>
              </button>

              <button
                class="rv-toggle-btn toggle-eq"
                :class="{ active: syncForm.filterModes.equal }"
                @click="toggleFilterMode('equal')"
                :title="$t('ui.sync.tipEqual')"
              >
                <Equal class="rv-icon text-neutral" />
                <span>{{ $t('ui.sync.equal', { count: syncForm.diffResult?.total_equal || 0 }) }}</span>
              </button>

              <button
                class="rv-toggle-btn toggle-diff"
                :class="{ active: syncForm.filterModes.different }"
                @click="toggleFilterMode('different')"
                :title="$t('ui.sync.tipDifferent')"
              >
                <SlidersHorizontal class="rv-icon text-purple" />
                <span>{{ $t('ui.sync.different', { count: syncForm.diffResult?.total_different || 0 }) }}</span>
              </button>

              <button
                v-if="syncForm.diffResult?.total_error > 0"
                class="rv-toggle-btn toggle-err"
                :class="{ active: syncForm.filterModes.error }"
                @click="toggleFilterMode('error')"
                :title="$t('ui.sync.tipError')"
              >
                <AlertTriangle class="rv-icon text-red" />
                <span>{{ $t('ui.sync.error', { count: syncForm.diffResult?.total_error || 0 }) }}</span>
              </button>
            </div>

            <!-- Middle Batch Actions (Copy Selected) -->
            <div class="actions-group">
              <button
                class="btn btn-sm btn-emerald"
                @click="handleCopySelected"
                :disabled="syncForm.selectedItems.size === 0 || syncForm.isCopyingSelected"
                :title="$t('ui.sync.copySelectedTip')"
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
                      :title="$t('ui.sync.selectAllTip')"
                    />
                  </th>
                  <th class="col-src-name">{{ $t('ui.sync.colSrcName') }}</th>
                  <th class="col-src-size">Size</th>
                  <th class="col-src-date">Date Modified</th>

                  <!-- Center Direction Indicator Header -->
                  <th class="col-dir">Dir</th>

                  <!-- Destination Side Headers -->
                  <th class="col-dst-name">{{ $t('ui.sync.colDstName') }}</th>
                  <th class="col-dst-size">Size</th>
                  <th class="col-dst-date">Date Modified</th>

                  <!-- Quick Action Header -->
                  <th class="col-act">{{ $t('ui.sync.colActions') }}</th>
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
                      <ArrowRight v-if="item.status === 'source_only'" class="dir-icon text-green" :title="$t('ui.sync.dirSourceOnly')" />
                      <ArrowLeft v-else-if="item.status === 'dest_only'" class="dir-icon text-blue" :title="$t('ui.sync.dirDestOnly')" />
                      <SlidersHorizontal v-else-if="item.status === 'different'" class="dir-icon text-purple" :title="$t('ui.sync.dirDifferent')" />
                      <Equal v-else-if="item.status === 'equal'" class="dir-icon text-neutral" :title="$t('ui.sync.dirEqual')" />
                      <AlertTriangle v-else class="dir-icon text-red" :title="$t('ui.sync.dirError')" />
                    </div>
                  </td>

                  <!-- Dest: Name -->
                  <td class="col-dst-name">
                    <div class="rv-file-entry" :class="{ 'entry-empty': item.status === 'source_only' }">
                      <span v-if="item.status === 'source_only'" class="entry-placeholder">{{ $t('ui.sync.notInDest') }}</span>
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
                      :title="$t('ui.sync.copySingleTip')"
                    >
                      <span>{{ $t('ui.sync.copyOne') }}</span>
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
                      <span>{{ $t('ui.sync.noMatchFilter') }}</span>
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
                      <h4>{{ $t('ui.sync.noDiffTitle') }}</h4>
                      <p>{{ $t('ui.sync.noDiffDesc') }}</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- RcloneView Classical Status Bar (如截屏底部之统计列) -->
          <div class="rcloneview-statusbar">
            <div class="status-left">
              <span>{{ $t('ui.sync.statusLeft', { count: syncForm.diffResult?.total_source_files || 0 }) }}</span>
            </div>
            <div class="status-center">
              <span class="selected-count-tag">
                {{ syncForm.selectedItems.size }} item(s) selected.
              </span>
            </div>
            <div class="status-right">
              <span>{{ $t('ui.sync.statusRight', { count: syncForm.diffResult?.total_dest_files || 0 }) }}</span>
            </div>
          </div>

          <!-- Collapsible Task Log Drawer -->
          <details class="task-log-details" :open="Boolean(syncForm.taskLog)">
            <summary class="log-summary">
              <span>{{ $t('ui.sync.logTitle') }}</span>
              <span class="log-summary-hint">{{ syncForm.isRunning ? $t('ui.sync.logRunning') : '' }}</span>
            </summary>
            <pre class="log-content-pre">{{ syncForm.taskLog || $t('ui.sync.logEmpty') }}</pre>
          </details>
        </div>
      </section>

      <!-- TAB 3: SCHEDULER -->
      <section v-if="activeTab === 'scheduler'" class="tab-pane">
        <div class="sub-bar">
          <div class="sub-title-group">
            <h2>{{ $t('ui.tasks.title') }}</h2>
            <p>{{ $t('ui.tasks.subtitle') }}</p>
          </div>
          <button class="btn btn-primary" @click="showAddTaskModal = true">
            <PlusCircle class="btn-icon" />
            <span>{{ $t('ui.tasks.addTask') }}</span>
          </button>
        </div>

        <div v-if="scheduledTasks.length > 0" class="task-table-wrapper">
          <table class="task-table">
            <thead>
              <tr>
                <th>{{ $t('ui.tasks.colStatus') }}</th>
                <th>{{ $t('ui.tasks.colName') }}</th>
                <th>{{ $t('ui.tasks.colSource') }}</th>
                <th>{{ $t('ui.tasks.colDest') }}</th>
                <th>{{ $t('ui.tasks.colMode') }}</th>
                <th>{{ $t('ui.tasks.colFrequency') }}</th>
                <th>{{ $t('ui.tasks.colLastRun') }}</th>
                <th>{{ $t('ui.tasks.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in scheduledTasks" :key="task.id">
                <td>
                  <span class="status-pill" :class="task.enabled ? 'pill-active' : 'pill-disabled'">
                    {{ task.enabled ? $t('task.status.' + (task.status || 'idle')) : $t('ui.tasks.disabled') }}
                  </span>
                </td>
                <td class="font-bold">{{ task.name }}</td>
                <td class="font-mono text-cyan">{{ task.source }}</td>
                <td class="font-mono text-emerald">{{ task.dest }}</td>
                <td>{{ $t('task.action.' + (task.action || 'copy')) }}</td>
                <td>{{ $t('ui.tasks.everyNMinutes', { n: task.intervalMinutes }) }}</td>
                <td>{{ task.lastRun || $t('ui.tasks.neverRun') }}</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="executeTaskNow(task)"
                      :disabled="task.status === 'running'"
                      :title="$t('ui.tasks.runNowTip')"
                    >
                      <Play class="btn-icon" />
                      <span>{{ $t('ui.tasks.run') }}</span>
                    </button>
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="openEditTaskModal(task)"
                      :title="$t('ui.tasks.editTip')"
                    >
                      <Pencil class="btn-icon" />
                      <span>{{ $t('ui.tasks.edit') }}</span>
                    </button>
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="toggleTaskEnabled(task)"
                      :title="task.enabled ? $t('ui.tasks.pauseTip') : $t('ui.tasks.enableTip')"
                    >
                      {{ task.enabled ? $t('ui.tasks.disable') : $t('ui.tasks.enable') }}
                    </button>
                    <button
                      class="btn btn-danger btn-sm"
                      @click="removeTask(task.id)"
                      :title="$t('ui.tasks.deleteTip')"
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
          <h2>{{ $t('ui.tasks.emptyTitle') }}</h2>
          <p>{{ $t('ui.tasks.emptyDesc') }}</p>
          <button class="btn btn-primary" @click="showAddTaskModal = true">
            <PlusCircle class="btn-icon" />
            <span>{{ $t('ui.tasks.createFirst') }}</span>
          </button>
        </div>
      </section>

      <!-- TAB 4: WEB-GUI -->
      <section v-if="activeTab === 'webgui'" class="tab-pane">
        <div class="sub-bar">
          <div class="sub-title-group">
            <h2>{{ $t('ui.webgui.title') }}</h2>
            <p>{{ $t('ui.webgui.subtitle') }}</p>
          </div>
          <div class="sub-actions">
            <button
              class="btn"
              :class="envStatus.webgui_running ? 'btn-danger' : 'btn-primary'"
              @click="toggleWebGui"
            >
              <Power class="btn-icon" />
              <span>{{ envStatus.webgui_running ? $t('ui.webgui.stop') : $t('ui.webgui.start') }}</span>
            </button>

            <button class="btn btn-emerald" @click="openWebGuiInBrowser">
              <ExternalLink class="btn-icon" />
              <span>{{ $t('ui.webgui.openBrowser') }}</span>
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
            <h3>{{ $t('ui.webgui.notRunningTitle') }}</h3>
            <p>{{ $t('ui.webgui.notRunningDesc') }}</p>
            <button class="btn btn-primary btn-lg" @click="toggleWebGui">
              <Power class="btn-icon" />
              <span>{{ $t('ui.webgui.startNow') }}</span>
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
            <span>{{ $t('ui.remote.addTitle') }}</span>
          </div>
          <div class="modal-header-actions">
            <button
              class="btn btn-secondary btn-sm"
              @click="handleOpenRcloneTerminal"
              :title="$t('ui.remote.terminalTip')"
            >
              <Terminal class="btn-icon" />
              <span>{{ $t('ui.remote.terminal') }}</span>
            </button>
            <button class="close-btn" @click="showAddRemoteModal = false">
              <X class="close-icon" />
            </button>
          </div>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.remote.nameLabel') }}</label>
            <input
              type="text"
              v-model="newRemoteForm.name"
              class="modal-input"
              :placeholder="$t('ui.remote.namePlaceholder')"
            />
            <span class="field-hint">{{ $t('ui.remote.nameHint') }}</span>
          </div>

          <div class="setting-group">
            <div class="flex-between mb-1">
              <label class="group-title">{{ $t('ui.remote.providerLabel') }}</label>
              <span class="text-xs text-muted">{{ $t('ui.remote.providerHint') }}</span>
            </div>
            <!-- Provider Filter / Search -->
            <div class="search-input-wrapper mb-2">
              <Search class="search-icon" />
              <input
                type="text"
                v-model="newRemoteForm.searchProvider"
                class="modal-input search-input"
                :placeholder="$t('ui.remote.searchPlaceholder')"
              />
              <button
                v-if="newRemoteForm.searchProvider"
                class="search-clear-btn"
                @click="newRemoteForm.searchProvider = ''"
              >
                <X class="clear-icon" />
              </button>
            </div>

            <select v-model="newRemoteForm.type" class="modal-input" @change="onNewRemoteTypeChange">
              <optgroup
                v-for="cat in filteredStorageCategories"
                :key="cat.id"
                :label="cat.label"
              >
                <option v-for="it in cat.items" :key="it.type" :value="it.type">
                  {{ it.name }}
                </option>
              </optgroup>
              <optgroup
                v-if="allOtherRcloneProviders.length > 0"
                :label="$t('ui.remote.moreProviders', { count: allOtherRcloneProviders.length })"
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
              <span class="text-cyan font-bold">{{ $t('ui.remote.oauthTitle') }}</span>
            </div>
            <p class="group-desc">
              {{ $t('ui.remote.oauthDesc1') }}<br />
              {{ $t('ui.remote.oauthDesc2') }}
            </p>
            <!-- Optional Advanced OAuth Client ID / Secret -->
            <details class="advanced-details mt-2">
              <summary class="advanced-summary">{{ $t('ui.remote.advancedOAuth') }}</summary>
              <div class="setting-group mt-2">
                <input
                  type="text"
                  v-model="newRemoteForm.clientId"
                  class="modal-input"
                  :placeholder="$t('ui.remote.clientIdPlaceholder')"
                />
                <input
                  type="password"
                  v-model="newRemoteForm.clientSecret"
                  class="modal-input mt-2"
                  :placeholder="$t('ui.remote.clientSecretPlaceholder')"
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
                <span class="font-bold text-amber">{{ $t('ui.remote.s3AuthTitle') }}</span>
              </div>
              <p class="group-desc">
                <span v-html="$t('ui.remote.s3AuthDesc')"></span>
              </p>
            </div>

            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.s3ProviderLabel') }}</label>
              <select
                :value="newRemoteForm.s3Provider"
                @change="onS3ProviderSelect(newRemoteForm, $event.target.value)"
                class="modal-input"
              >
                <option v-for="sp in S3_PROVIDERS" :key="sp.value" :value="sp.value">
                  {{ $t(sp.labelKey) }}
                </option>
              </select>
            </div>

            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.s3AccessKeyLabel') }}</label>
              <input
                type="text"
                v-model="newRemoteForm.s3AccessKey"
                class="modal-input font-mono"
                :placeholder="$t('ui.remote.s3AccessKeyPlaceholder')"
              />
            </div>

            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.s3SecretKeyLabel') }}</label>
              <div class="password-wrapper">
                <input
                  :type="newRemoteForm.showSecretKey ? 'text' : 'password'"
                  v-model="newRemoteForm.s3SecretKey"
                  class="modal-input font-mono pr-10"
                  :placeholder="$t('ui.remote.s3SecretKeyPlaceholder')"
                />
                <button
                  type="button"
                  class="toggle-eye-btn"
                  @click="newRemoteForm.showSecretKey = !newRemoteForm.showSecretKey"
                  :title="newRemoteForm.showSecretKey ? $t('ui.remote.hideSecret') : $t('ui.remote.showSecret')"
                >
                  <EyeOff v-if="newRemoteForm.showSecretKey" class="eye-icon" />
                  <Eye v-else class="eye-icon" />
                </button>
              </div>
            </div>

            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.regionLabel') }}</label>
                <input
                  type="text"
                  v-model="newRemoteForm.s3Region"
                  class="modal-input font-mono"
                  :placeholder="$t('ui.remote.regionPlaceholder')"
                />
              </div>

              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.endpointLabel') }}</label>
                <input
                  type="text"
                  v-model="newRemoteForm.s3Endpoint"
                  class="modal-input font-mono"
                  :placeholder="$t('ui.remote.endpointPlaceholder')"
                />
              </div>
            </div>

            <!-- S3 Advanced Options -->
            <details class="advanced-details mt-2">
              <summary class="advanced-summary">{{ $t('ui.remote.s3Advanced') }}</summary>
              <div class="setting-group mt-2">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="newRemoteForm.s3ForcePathStyle" />
                  <span v-html="$t('ui.remote.s3PathStyle')"></span>
                </label>
                <label class="checkbox-label mt-1">
                  <input type="checkbox" v-model="newRemoteForm.s3EnvAuth" />
                  <span>{{ $t('ui.remote.s3EnvAuth') }}</span>
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
                <label class="group-title">{{ $t('ui.remote.username') }}</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="Username" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.passwordOrApp') }}</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" placeholder="Password" />
              </div>
            </div>
          </template>

          <!-- 中国大陆网盘：PikPak (rclone 原生 backend) -->
          <template v-if="newRemoteForm.type === 'pikpak'">
            <div class="info-box">
              <div class="info-title">
                <Info class="info-icon text-cyan" />
                <span class="text-cyan font-bold">{{ $t('ui.remote.pikpakTitle') }}</span>
              </div>
              <p class="group-desc">
                <span v-html="$t('ui.remote.pikpakDesc')"></span>
              </p>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.accountLabel') }}</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="your-account@example.com" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.password') }}</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" :placeholder="$t('ui.remote.pikpakPasswordPlaceholder')" />
              </div>
            </div>
          </template>

          <!-- 坚果云 WebDAV -->
          <template v-if="newRemoteForm.type === 'nutstore'">
            <div class="info-box">
              <div class="info-title">
                <Info class="info-icon text-cyan" />
                <span class="text-cyan font-bold">{{ $t('ui.remote.nutstoreTitle') }}</span>
              </div>
              <p class="group-desc">
                <span v-html="$t('ui.remote.nutstoreDesc')"></span>
              </p>
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.serverFixed') }}</label>
              <input type="text" class="modal-input font-mono" value="https://dav.jianguoyun.com/dav/" disabled />
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.nutstoreAccount') }}</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="your-account@example.com" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.appPassword') }}</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" :placeholder="$t('ui.remote.nutstorePasswordPlaceholder')" />
              </div>
            </div>
          </template>

          <!-- 123 云盘官方 WebDAV -->
          <template v-if="newRemoteForm.type === 'pan123'">
            <div class="info-box">
              <div class="info-title">
                <Info class="info-icon text-cyan" />
                <span class="text-cyan font-bold">{{ $t('ui.remote.pan123Title') }}</span>
              </div>
              <p class="group-desc">
                <span v-html="$t('ui.remote.pan123Desc')"></span>
              </p>
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.serverFixed') }}</label>
              <input type="text" class="modal-input font-mono" value="https://webdav.123pan.cn/webdav" disabled />
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.pan123Account') }}</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="13800000000" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.appPassword') }}</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" :placeholder="$t('ui.remote.pan123PasswordPlaceholder')" />
              </div>
            </div>
          </template>

          <!-- OpenList / AList 聚合 WebDAV -->
          <template v-if="newRemoteForm.type === 'openlist'">
            <div class="info-box">
              <div class="info-title">
                <Info class="info-icon text-amber" />
                <span class="font-bold text-amber">{{ $t('ui.remote.openlistTitle') }}</span>
              </div>
              <p class="group-desc">
                <span v-html="$t('ui.remote.openlistDesc1')"></span>
                <span v-html="$t('ui.remote.openlistDesc2')"></span>
              </p>
              <p class="group-desc">
                {{ $t('ui.remote.openlistProject') }}
                <a href="#" @click.prevent="openUrl('https://github.com/OpenListTeam/OpenList')" class="text-cyan">github.com/OpenListTeam/OpenList</a>
              </p>
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.openlistUrlLabel') }}</label>
              <input type="text" v-model="newRemoteForm.url" class="modal-input font-mono" placeholder="http://192.168.1.10:5244/dav" />
              <span class="field-hint">{{ $t('ui.remote.openlistUrlHint') }}</span>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.openlistUser') }}</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="admin" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.openlistPassword') }}</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" :placeholder="$t('ui.remote.openlistPasswordPlaceholder')" />
              </div>
            </div>
          </template>

          <!-- SMB / Windows Shared Folder Inputs -->
          <template v-if="newRemoteForm.type === 'smb'">
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.smbHost') }}</label>
                <input type="text" v-model="newRemoteForm.host" class="modal-input" :placeholder="$t('ui.remote.smbHostPlaceholder')" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.portLabel') }}</label>
                <input type="text" v-model="newRemoteForm.port" class="modal-input" placeholder="445" />
              </div>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.smbUser') }}</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="Username" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.smbPassword') }}</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" placeholder="Password" />
              </div>
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.smbDomain') }}</label>
              <input type="text" v-model="newRemoteForm.domain" class="modal-input" placeholder="WORKGROUP" />
            </div>
          </template>

          <!-- FTP / SFTP Inputs -->
          <template v-if="newRemoteForm.type === 'ftp' || newRemoteForm.type === 'sftp'">
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.hostLabel') }}</label>
                <input type="text" v-model="newRemoteForm.host" class="modal-input" :placeholder="$t('ui.remote.hostPlaceholder')" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.portLabel') }}</label>
                <input type="text" v-model="newRemoteForm.port" class="modal-input" :placeholder="newRemoteForm.type === 'sftp' ? '22' : '21'" />
              </div>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.userAccount') }}</label>
                <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="Username" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.password') }}</label>
                <input type="password" v-model="newRemoteForm.pass" class="modal-input" placeholder="Password" />
              </div>
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.remotePathLabel') }}</label>
              <input type="text" v-model="newRemoteForm.remotePath" class="modal-input" :placeholder="$t('ui.remote.remotePathPlaceholder')" />
              <p class="group-desc">{{ $t('ui.remote.remotePathDesc') }}</p>
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
              <label class="group-title">{{ $t('ui.remote.emailAccount') }}</label>
              <input type="text" v-model="newRemoteForm.user" class="modal-input" placeholder="your-email@example.com" />
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.password') }}</label>
              <input type="password" v-model="newRemoteForm.pass" class="modal-input" placeholder="Password" />
            </div>
          </template>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddRemoteModal = false">{{ $t('common.cancel') }}</button>
          <button
            class="btn btn-primary"
            @click="submitAddRemote"
            :disabled="newRemoteForm.isCreating"
          >
            <Disc3 class="btn-icon" :class="{ 'spin-anim': newRemoteForm.isCreating }" />
            <span v-if="newRemoteForm.isCreating">
              {{ isOAuthType(newRemoteForm.type) ? $t('ui.remote.creatingOAuth') : $t('ui.remote.creating') }}
            </span>
            <span v-else>
              {{ isOAuthType(newRemoteForm.type) ? $t('ui.remote.createOAuth') : (newRemoteForm.type === 's3' ? $t('ui.remote.createS3') : $t('ui.remote.create')) }}
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
            <span>{{ $t('ui.remote.editTitle', { name: editRemoteForm.newName || editRemoteForm.name }) }}</span>
          </div>
          <button class="close-btn" @click="showEditRemoteModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.remote.nameLabel') }}</label>
            <input
              type="text"
              v-model="editRemoteForm.newName"
              class="modal-input font-bold"
              :placeholder="$t('ui.remote.editNamePlaceholder')"
            />
            <span class="field-hint">{{ $t('ui.remote.editNameHint') }}</span>
          </div>

          <div class="setting-group">
            <label class="group-title">{{ $t('ui.remote.typeLabel') }}</label>
            <div class="text-cyan font-bold">{{ providerDetailName(editRemoteForm.type, editRemoteForm.description) }} ({{ editRemoteForm.type }})</div>
          </div>

          <!-- OAuth Re-authenticate for Drive / OneDrive -->
          <div v-if="editRemoteForm.type.includes('drive') || editRemoteForm.type.includes('onedrive')" class="setting-group info-box">
            <div class="info-title">
              <KeyRound class="info-icon" />
              <span>{{ $t('ui.remote.reauthTitle') }}</span>
            </div>
            <p class="group-desc">
              {{ $t('ui.remote.reauthDesc') }}
            </p>
            <button
              class="btn btn-emerald mt-2"
              @click="handleReconnectRemote"
              :disabled="editRemoteForm.isReconnecting"
            >
              <RotateCw class="btn-icon" :class="{ 'spin-anim': editRemoteForm.isReconnecting }" />
              <span>{{ editRemoteForm.isReconnecting ? $t('ui.remote.reconnecting') : $t('ui.remote.reauth') }}</span>
            </button>
          </div>

          <!-- S3 Edit -->
          <template v-if="editRemoteForm.type.includes('s3')">
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.s3ProviderLabel') }}</label>
              <select
                :value="editRemoteForm.s3Provider"
                @change="onS3ProviderSelect(editRemoteForm, $event.target.value)"
                class="modal-input"
              >
                <option v-for="sp in S3_PROVIDERS" :key="sp.value" :value="sp.value">
                  {{ $t(sp.labelKey) }}
                </option>
              </select>
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.s3AccessKeyLabel') }}</label>
              <input type="text" v-model="editRemoteForm.s3AccessKey" class="modal-input font-mono" placeholder="Access Key ID" />
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.s3SecretKeyLabel') }}</label>
              <div class="password-wrapper">
                <input
                  :type="editRemoteForm.showSecretKey ? 'text' : 'password'"
                  v-model="editRemoteForm.s3SecretKey"
                  class="modal-input font-mono pr-10"
                  :placeholder="$t('ui.remote.secretUnchanged')"
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
                <label class="group-title">{{ $t('ui.remote.regionLabel') }}</label>
                <input type="text" v-model="editRemoteForm.s3Region" class="modal-input font-mono" :placeholder="$t('ui.remote.regionEditPlaceholder')" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.endpointLabel') }}</label>
                <input type="text" v-model="editRemoteForm.s3Endpoint" class="modal-input font-mono" :placeholder="$t('ui.remote.endpointEditPlaceholder')" />
              </div>
            </div>
            <details class="advanced-details mt-2">
              <summary class="advanced-summary">{{ $t('ui.remote.s3AdvancedShort') }}</summary>
              <div class="setting-group mt-2">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editRemoteForm.s3ForcePathStyle" />
                  <span>{{ $t('ui.remote.s3PathStyleShort') }}</span>
                </label>
                <label class="checkbox-label mt-1">
                  <input type="checkbox" v-model="editRemoteForm.s3EnvAuth" />
                  <span>{{ $t('ui.remote.s3EnvAuthShort') }}</span>
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
              <label class="group-title">{{ $t('ui.remote.username') }}</label>
              <input type="text" v-model="editRemoteForm.user" class="modal-input" />
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.newPasswordLabel') }}</label>
              <input type="password" v-model="editRemoteForm.pass" class="modal-input" :placeholder="$t('ui.remote.passwordUnchanged')" />
            </div>
          </template>

          <!-- PikPak Edit -->
          <template v-if="editRemoteForm.type === 'pikpak'">
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.accountLabel') }}</label>
              <input type="text" v-model="editRemoteForm.user" class="modal-input" />
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.newPasswordLabel') }}</label>
              <input type="password" v-model="editRemoteForm.pass" class="modal-input" :placeholder="$t('ui.remote.passwordUnchanged')" />
            </div>
            <p class="group-desc">{{ $t('ui.remote.pikpakEditDesc') }}</p>
          </template>

          <!-- SMB Edit -->
          <template v-if="editRemoteForm.type === 'smb'">
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.hostLabel') }}</label>
                <input type="text" v-model="editRemoteForm.host" class="modal-input" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.portLabel') }}</label>
                <input type="text" v-model="editRemoteForm.port" class="modal-input" placeholder="445" />
              </div>
            </div>
            <div class="grid-2-col">
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.userAccount') }}</label>
                <input type="text" v-model="editRemoteForm.user" class="modal-input" />
              </div>
              <div class="setting-group">
                <label class="group-title">{{ $t('ui.remote.newPasswordLabel') }}</label>
                <input type="password" v-model="editRemoteForm.pass" class="modal-input" :placeholder="$t('ui.remote.passwordUnchanged')" />
              </div>
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.smbDomainShort') }}</label>
              <input type="text" v-model="editRemoteForm.domain" class="modal-input" />
            </div>
          </template>

          <!-- FTP / SFTP Edit -->
          <template v-if="editRemoteForm.type === 'ftp' || editRemoteForm.type === 'sftp'">
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.hostLabel') }}</label>
              <input type="text" v-model="editRemoteForm.host" class="modal-input" />
            </div>
            <div class="setting-group" v-if="editRemoteForm.type === 'ftp' || editRemoteForm.type === 'sftp'">
              <label class="group-title">{{ $t('ui.remote.portLabel') }}</label>
              <input type="text" v-model="editRemoteForm.port" class="modal-input" :placeholder="editRemoteForm.type === 'sftp' ? '22' : '21'" />
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.userAccount') }}</label>
              <input type="text" v-model="editRemoteForm.user" class="modal-input" />
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.newPasswordLabel') }}</label>
              <input type="password" v-model="editRemoteForm.pass" class="modal-input" :placeholder="$t('ui.remote.passwordUnchanged')" />
            </div>
            <div class="setting-group">
              <label class="group-title">{{ $t('ui.remote.remotePathLabel') }}</label>
              <input type="text" v-model="editRemoteForm.remotePath" class="modal-input" :placeholder="$t('ui.remote.remotePathPlaceholder')" />
              <p class="group-desc">{{ $t('ui.remote.remotePathDesc') }}</p>
            </div>
          </template>

          <!-- Optional Client ID / Secret for Advanced Users -->
          <div v-if="editRemoteForm.type.includes('drive') || editRemoteForm.type.includes('onedrive')" class="setting-group">
            <label class="group-title">{{ $t('ui.remote.customClientId') }}</label>
            <input
              type="text"
              v-model="editRemoteForm.clientId"
              class="modal-input"
              :placeholder="editRemoteForm.type.includes('onedrive') ? $t('ui.remote.msClientIdPlaceholder') : $t('ui.remote.googleClientIdPlaceholder')"
            />
            <label class="group-title mt-2">{{ $t('ui.remote.customClientSecret') }}</label>
            <input
              type="password"
              v-model="editRemoteForm.clientSecret"
              class="modal-input"
              :placeholder="editRemoteForm.type.includes('onedrive') ? $t('ui.remote.msClientSecretPlaceholder') : $t('ui.remote.googleClientSecretPlaceholder')"
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showEditRemoteModal = false">{{ $t('common.cancel') }}</button>
          <button
            class="btn btn-primary"
            @click="submitEditRemote"
            :disabled="editRemoteForm.isSaving"
          >
            <Check class="btn-icon" />
            <span>{{ editRemoteForm.isSaving ? $t('ui.remote.saving') : $t('common.saveChanges') }}</span>
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
            <span>{{ $t('ui.taskModal.addTitle') }}</span>
          </div>
          <button class="close-btn" @click="showAddTaskModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.nameLabel') }}</label>
            <input type="text" v-model="newTask.name" class="modal-input" :placeholder="$t('ui.taskModal.namePlaceholder')" />
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.sourceLabel') }}</label>
            <input type="text" v-model="newTask.source" class="modal-input" :placeholder="$t('ui.taskModal.sourcePlaceholder')" />
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.destLabel') }}</label>
            <input type="text" v-model="newTask.dest" class="modal-input" :placeholder="$t('ui.taskModal.destPlaceholder')" />
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.actionLabel') }}</label>
            <select v-model="newTask.action" class="modal-input">
              <option value="copy">{{ $t('ui.taskModal.actionCopy') }}</option>
              <option value="sync">{{ $t('ui.taskModal.actionSync') }}</option>
            </select>
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.filterLabel') }}</label>
            <input type="text" v-model="newTask.excludeFilter" class="modal-input" :placeholder="$t('ui.taskModal.filterPlaceholder')" />
            <span class="field-hint">{{ $t('ui.taskModal.filterHint') }}</span>
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.intervalLabel') }}</label>
            <input type="number" v-model="newTask.intervalMinutes" class="modal-input" min="5" placeholder="60" />
            <span class="field-hint">{{ $t('ui.taskModal.intervalHint') }}</span>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAddTaskModal = false">{{ $t('common.cancel') }}</button>
          <button class="btn btn-primary" @click="submitAddTask">{{ $t('ui.taskModal.create') }}</button>
        </div>
      </div>
    </div>

    <!-- MODAL: EDIT TASK (SCHEDULER) -->
    <div v-if="showEditTaskModal" class="modal-backdrop" @click.self="showEditTaskModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <Pencil class="modal-title-icon" />
            <span>{{ $t('ui.taskModal.editTitle') }}</span>
          </div>
          <button class="close-btn" @click="showEditTaskModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.nameLabel') }}</label>
            <input type="text" v-model="editTaskForm.name" class="modal-input" :placeholder="$t('ui.taskModal.namePlaceholder')" />
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.sourceLabel') }}</label>
            <input type="text" v-model="editTaskForm.source" class="modal-input" :placeholder="$t('ui.taskModal.sourcePlaceholder')" />
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.destLabel') }}</label>
            <input type="text" v-model="editTaskForm.dest" class="modal-input" :placeholder="$t('ui.taskModal.destPlaceholder')" />
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.actionLabel') }}</label>
            <select v-model="editTaskForm.action" class="modal-input">
              <option value="copy">{{ $t('ui.taskModal.actionCopy') }}</option>
              <option value="sync">{{ $t('ui.taskModal.actionSync') }}</option>
            </select>
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.filterLabel') }}</label>
            <input type="text" v-model="editTaskForm.excludeFilter" class="modal-input" :placeholder="$t('ui.taskModal.filterPlaceholder')" />
            <span class="field-hint">{{ $t('ui.taskModal.filterHint') }}</span>
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.intervalLabel') }}</label>
            <input type="number" v-model="editTaskForm.intervalMinutes" class="modal-input" min="1" placeholder="60" />
            <span class="field-hint">{{ $t('ui.taskModal.intervalHint') }}</span>
          </div>
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.taskModal.statusLabel') }}</label>
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" v-model="editTaskForm.enabled" />
              <span>{{ $t('ui.taskModal.enableLabel') }}</span>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showEditTaskModal = false">{{ $t('common.cancel') }}</button>
          <button class="btn btn-primary" @click="submitEditTask">{{ $t('common.saveChanges') }}</button>
        </div>
      </div>
    </div>

    <!-- MODAL: SETTINGS -->
    <div v-if="showSettings" class="modal-backdrop" @click.self="showSettings = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <Sliders class="modal-title-icon" />
            <span>{{ $t('ui.settings.title') }}</span>
          </div>
          <button class="close-btn" @click="showSettings = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.settings.rclonePathLabel') }}</label>
            <p class="group-desc">{{ $t('ui.settings.rclonePathDesc') }}</p>
            <div class="input-with-button">
              <input type="text" v-model="customRclonePath" class="modal-input" />
              <button class="btn btn-secondary" @click="saveCustomPath">{{ $t('ui.settings.savePath') }}</button>
            </div>
          </div>

          <div class="setting-group">
            <div class="switch-row">
              <div>
                <div class="switch-title">{{ $t('ui.settings.autostartTitle') }}</div>
                <div class="group-desc">{{ $t('ui.settings.autostartDesc') }}</div>
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
                <div class="switch-title">{{ $t('ui.settings.startMinimizedTitle') }}</div>
                <div class="group-desc">{{ $t('ui.settings.startMinimizedDesc') }}</div>
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
            <label class="group-title">{{ $t('settings.language') }}</label>
            <p class="group-desc">{{ $t('settings.languageDesc') }}</p>
            <select class="modal-input" :value="locale" @change="changeLanguage($event.target.value)">
              <option v-for="lang in languages" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
            </select>
          </div>

          <div class="setting-group">
            <label class="group-title">{{ $t('ui.settings.globalPresetTitle') }}</label>
            <p class="group-desc">{{ $t('ui.settings.globalPresetDesc') }}</p>
            <select
              v-model="globalMountPreset"
              @change="saveGlobalMountPreset(globalMountPreset)"
              class="modal-input"
            >
              <option value="fast">{{ $t('ui.settings.presetFast') }}</option>
              <option value="default">{{ $t('ui.settings.presetDefault') }}</option>
              <option value="custom">{{ $t('ui.settings.presetCustom') }}</option>
            </select>
          </div>

          <div class="setting-group">
            <div class="switch-row">
              <div>
                <div class="switch-title">{{ $t('ui.settings.lightModeTitle') }}</div>
                <div class="group-desc">{{ $t('ui.settings.lightModeDesc') }}</div>
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
                <div class="switch-title">{{ $t('ui.settings.autoCheckTitle') }}</div>
                <div class="group-desc">
                  {{ $t('ui.settings.versionInfo', { version: CURRENT_VERSION, time: updateSettings.lastCheckTimeStr || $t('msg.update.neverChecked') }) }}
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
            <label class="group-title">{{ $t('ui.settings.intervalLabel') }}</label>
            <p class="group-desc">{{ $t('ui.settings.intervalDesc') }}</p>
            <select
              v-model.number="updateSettings.intervalDays"
              @change="saveUpdateSettings"
              class="modal-input"
            >
              <option :value="1">{{ $t('ui.settings.interval1d') }}</option>
              <option :value="3">{{ $t('ui.settings.interval3d') }}</option>
              <option :value="7">{{ $t('ui.settings.interval7d') }}</option>
              <option :value="14">{{ $t('ui.settings.interval14d') }}</option>
              <option :value="30">{{ $t('ui.settings.interval30d') }}</option>
            </select>
          </div>

          <div class="setting-group">
            <div class="switch-row">
              <div>
                <div class="switch-title">{{ $t('ui.settings.manualCheckTitle') }}</div>
                <div class="group-desc">{{ $t('ui.settings.manualCheckDesc') }}</div>
              </div>
              <button
                class="btn btn-secondary btn-sm"
                @click="checkForUpdates(true)"
                :disabled="isCheckingUpdate"
              >
                <RefreshCw class="btn-icon" :class="{ 'spin-anim': isCheckingUpdate }" />
                <span>{{ isCheckingUpdate ? $t('ui.settings.checking') : $t('ui.header.checkUpdate') }}</span>
              </button>
            </div>
          </div>

          <div class="setting-group info-box">
            <div class="info-title">
              <Info class="info-icon" />
              <span>{{ $t('ui.settings.depsTitle') }}</span>
            </div>
            <p class="group-desc">
              <span v-html="$t('ui.settings.depsWinfsp')"></span><a href="#" class="link" @click.prevent="openUrl('https://winfsp.dev/')">{{ $t('ui.settings.depsWinfspLink') }}</a><br />
              <span v-html="$t('ui.settings.depsRclone')"></span><a href="#" class="link" @click.prevent="openUrl('https://rclone.org/downloads/')">{{ $t('ui.settings.depsRcloneLink') }}</a>
            </p>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showSettings = false">{{ $t('common.close') }}</button>
        </div>
      </div>
    </div>

    <!-- MODAL: CLOUD DIRECTORY BROWSER -->
    <div v-if="showCloudBrowseModal" class="modal-backdrop" @click.self="showCloudBrowseModal = false">
      <div class="modal-card cloud-browser-modal">
        <div class="modal-header">
          <div class="modal-title">
            <Cloud class="modal-title-icon text-cyan" />
            <span>{{ $t('ui.browse.title', { type: cloudBrowseTarget === 'source' ? $t('ui.browse.sourceType') : $t('ui.browse.destType') }) }}</span>
          </div>
          <button class="close-btn" @click="showCloudBrowseModal = false">
            <X class="close-icon" />
          </button>
        </div>

        <div class="modal-body">
          <!-- Remote Selector -->
          <div class="setting-group">
            <label class="group-title">{{ $t('ui.browse.selectRemote') }}</label>
            <select v-model="cloudBrowseRemote" class="modal-input" @change="cloudBrowseCurrentSubpath = ''; fetchCloudDirs()">
              <option v-for="r in remotes" :key="r.name" :value="r.name">
                {{ r.name }} ({{ r.remote_type }})
              </option>
            </select>
          </div>

          <!-- Current Path Breadcrumb -->
          <div class="cloud-breadcrumb-bar">
            <button class="btn btn-xs btn-outline" @click="goCloudParentDir" :disabled="!cloudBrowseCurrentSubpath">
              <span>{{ $t('ui.browse.parentDir') }}</span>
            </button>
            <div class="cloud-current-path" :title="`${cloudBrowseRemote}:${cloudBrowseCurrentSubpath}`">
              📁 {{ cloudBrowseRemote }}:/{{ cloudBrowseCurrentSubpath }}
            </div>
          </div>

          <!-- Directory List -->
          <div class="cloud-dirs-container">
            <div v-if="isLoadingCloudDirs" class="cloud-dirs-loading">
              <RefreshCw class="btn-icon spin-anim text-cyan" />
              <span>{{ $t('ui.browse.loading') }}</span>
            </div>
            <div v-else-if="cloudBrowseDirs.length === 0" class="cloud-dirs-empty">
              <span>{{ $t('ui.browse.empty') }}</span>
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
                  {{ $t('ui.browse.enter') }}
                </button>
              </div>
            </div>
          </div>
          <span class="field-hint">{{ $t('ui.browse.hint') }}</span>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showCloudBrowseModal = false">{{ $t('common.cancel') }}</button>
          <button class="btn btn-primary" @click="confirmCloudBrowseSelect">
            <span>{{ $t('ui.browse.selectPath', { path: cloudBrowseRemote + ':' + (cloudBrowseCurrentSubpath ? '/' + cloudBrowseCurrentSubpath : '') }) }}</span>
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
            <span>{{ $t('ui.update.title', { version: updateInfo.latestVersion }) }}</span>
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
              {{ $t('ui.update.publishedAt', { date: updateInfo.publishedAt }) }}
            </div>
          </div>

          <div class="update-release-title" v-if="updateInfo.releaseTitle">
            {{ updateInfo.releaseTitle }}
          </div>

          <div class="update-notes-container">
            <div class="update-notes-header">{{ $t('ui.update.notesHeader') }}</div>
            <pre class="update-notes-pre">{{ updateInfo.releaseNotes }}</pre>
          </div>

          <p class="update-tip">
            {{ $t('ui.update.tip') }}
          </p>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showUpdateModal = false" :disabled="isDownloadingUpdate">
            {{ $t('ui.update.later') }}
          </button>
          <button class="btn btn-secondary" @click="openUrl(updateInfo.htmlUrl)">
            <ExternalLink class="btn-icon" />
            <span>{{ $t('ui.update.viewGithub') }}</span>
          </button>
          <button class="btn btn-primary btn-update-action" @click="executeUpdate" :disabled="isDownloadingUpdate">
            <DownloadCloud class="btn-icon" :class="{ 'spin-anim': isDownloadingUpdate }" />
            <span>{{ isDownloadingUpdate ? $t('ui.update.downloading') : $t('ui.update.downloadRun') }}</span>
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
