import React, { useState, useEffect } from 'react';
import { SOURCE_CATALOG, SourceFileItem } from '../../data/sourceCatalog';
import {
  Code2,
  Download,
  Copy,
  Check,
  ExternalLink,
  Search,
  FileCode,
  FolderTree,
  Terminal,
  Database,
  Layers,
  FileText,
  Sparkles,
  BookOpen,
  Eye,
  RefreshCw
} from 'lucide-react';

export const OnlineSourceView: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<SourceFileItem>(SOURCE_CATALOG[0]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [codeFilter, setCodeFilter] = useState<string>('');

  // Fetch the selected file content
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetch(selectedFile.fetchUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`خطا در فراخوانی فایل: ${res.statusText}`);
        }
        return res.text();
      })
      .then((text) => {
        if (isMounted) {
          setFileContent(text);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setFileContent(`// امکان بارگذاری خودکار فایل وجود نداشت یا در این مسیر قرار دارد:\n// مسیر فایل: ${selectedFile.relativePath}\n// خطا: ${err.message}\n\n// برای دریافت فایل کامل می‌توانید از دکمه «دانلود بسته کامل کد (ZIP)» در نوار بالای صفحه استفاده کنید.`);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFile]);

  const handleCopyCode = () => {
    if (!fileContent) return;
    navigator.clipboard.writeText(fileContent);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredFiles = SOURCE_CATALOG.filter((f) => {
    const matchCat = activeCategory === 'all' || f.category === activeCategory;
    const matchSearch =
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.description.includes(searchTerm) ||
      f.relativePath.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  const categories = [
    { key: 'all', label: 'همه بخش‌ها' },
    { key: 'react-dashboard', label: 'داشبورد React' },
    { key: 'lan-frontend', label: 'فرانت‌اند لوکال LAN' },
    { key: 'backend-api', label: 'بک‌اند FastAPI' },
    { key: 'database', label: 'پایگاه داده SQL' },
    { key: 'scripts', label: 'اسکریپت‌های اجرا' },
    { key: 'docs', label: 'مستندات ممیزی' }
  ];

  // Filter lines if in-code search is typed
  const lines = fileContent.split('\n');
  const visibleLines = codeFilter.trim()
    ? lines.map((l, idx) => ({ text: l, lineNum: idx + 1 })).filter((l) => l.text.toLowerCase().includes(codeFilter.toLowerCase()))
    : lines.map((l, idx) => ({ text: l, lineNum: idx + 1 }));

  return (
    <div className="space-y-6">
      {/* Top Banner: Online Source Code Center */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 text-blue-800">
                <Code2 className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">
                مرکز کاوش و دریافت سورس آنلاین داشبورد و سامانه رضوان
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed max-w-4xl">
              تمامی کدهای منبع داشبورد مدرن، فرانت‌اند مستقل شبکه محلی (LAN)، وب‌سرویس‌های FastAPI، مدل‌های پایگاه داده PostgreSQL و اسکریپت‌های خودکار به صورت آنلاین در این بخش قابل مرور، کپی و دانلود است.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Open LAN standalone dashboard */}
            <a
              href="/lan/dashboard-41.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors cursor-pointer shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-700" />
              <span>اجرای آنلاین داشبورد LAN مستقل</span>
            </a>

            {/* Direct download full package */}
            <a
              href="/assets/HR-Rezvan-LAN-Enterprise-Release-1405.zip"
              download="HR-Rezvan-LAN-Enterprise-Release-1405.zip"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>دانلود بسته کامل کد (ZIP)</span>
            </a>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex items-center gap-1.5 border-t border-slate-200 mt-5 pt-3 overflow-x-auto text-xs">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeCategory === cat.key
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Download Card */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-blue-800 text-white rounded-xl p-5 sm:p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">
              نسخه نهایی مهر ۱۴۰۵
            </span>
            <h3 className="text-base sm:text-lg font-bold">
              دانلود مستقیم بسته کامل سورس سامانه و داشبورد رضوان
            </h3>
          </div>
          <p className="text-xs text-emerald-100 max-w-2xl leading-relaxed">
            فایل فشرده حاوی تمامی کدهای داشبورد مدرن (React)، فرانت‌اند مستقل LAN کارگاه، وب‌سرویس‌های پایتون (FastAPI)، اسکریپت‌های دیتابیس PostgreSQL و مستندات ممیزی (حجم: ۳.۷ مگابایت).
          </p>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-emerald-200 font-mono pt-1">
            <span>نام فایل: HR-Rezvan-LAN-Enterprise-Release-1405.zip</span>
            <span>·</span>
            <span>مسیر دانلود: /source.zip</span>
            <span>·</span>
            <span>آماده استخراج و اجرا</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <a
            href="/source.zip"
            download="HR-Rezvan-LAN-Enterprise-Release-1405.zip"
            className="px-6 py-3.5 bg-white text-emerald-900 hover:bg-emerald-50 text-sm font-extrabold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer hover:shadow-xl"
          >
            <Download className="w-5 h-5 text-emerald-700" />
            <span>دانلود فوری فایل ZIP (۳.۷ مگابایت)</span>
          </a>
        </div>
      </div>

      {/* Main Grid: File Explorer (Left) & Code Viewer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* File Browser Sidebar (4 cols on lg) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col h-[740px]">
          {/* Search Box */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/70">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="جستجوی نام یا مسیر فایل..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pr-9 pl-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <div className="text-[11px] text-slate-500 mt-2 flex justify-between items-center px-1">
              <span>تعداد فایل‌های یافت‌شده:</span>
              <span className="font-bold text-slate-700 font-mono">{filteredFiles.length} فایل</span>
            </div>
          </div>

          {/* Files List */}
          <div className="overflow-y-auto grow p-2 space-y-1 divide-y divide-slate-100">
            {filteredFiles.map((file) => {
              const isSelected = selectedFile.id === file.id;
              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-right p-2.5 rounded-lg transition-all cursor-pointer flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-blue-50/90 border border-blue-200 shadow-xs'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className={`p-1.5 rounded-md mt-0.5 shrink-0 ${
                    isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div className="grow min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                        {file.name}
                      </span>
                      {file.badge && (
                        <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                          {file.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5" dir="ltr">
                      {file.relativePath}
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-1 leading-relaxed">
                      {file.description}
                    </p>
                  </div>
                </button>
              );
            })}

            {filteredFiles.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                فایلی با عبارت جستجوشده یافت نشد.
              </div>
            )}
          </div>
        </div>

        {/* Code Inspector & Viewer Panel (8 cols on lg) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col h-[740px]">
          {/* Code Viewer Header */}
          <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="p-1 rounded bg-slate-800 text-slate-300">
                <FileCode className="w-4 h-4 text-emerald-400" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100 text-sm font-mono truncate">
                    {selectedFile.name}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                    {selectedFile.language}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate" dir="ltr">
                  {selectedFile.relativePath}
                </div>
              </div>
            </div>

            {/* Actions: Search inside code, Copy, Download */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative hidden sm:block">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2" />
                <input
                  type="text"
                  placeholder="جستجو درون کد..."
                  value={codeFilter}
                  onChange={(e) => setCodeFilter(e.target.value)}
                  className="bg-slate-800/90 text-slate-200 border border-slate-700 rounded-md pr-8 pl-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 w-36"
                />
              </div>

              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer text-xs"
              >
                {copySuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300 font-bold">کپی شد</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>کپی کد</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadFile}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-md transition-colors cursor-pointer text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود فایل</span>
              </button>
            </div>
          </div>

          {/* Description sub-header */}
          <div className="bg-slate-900/90 px-4 py-2 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>{selectedFile.description}</span>
            <span className="font-mono text-slate-500 text-[10px]">
              {lines.length} خط · {fileContent.length.toLocaleString('fa-IR')} کاراکتر
            </span>
          </div>

          {/* Code Body with Line Numbers */}
          <div className="grow overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-300 bg-slate-950/80">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                <span>در حال بارگذاری سورس آنلاین...</span>
              </div>
            ) : (
              <div className="space-y-0.5" dir="ltr">
                {visibleLines.map(({ text, lineNum }) => (
                  <div key={lineNum} className="flex hover:bg-slate-800/40 py-0.5 rounded px-1">
                    <span className="text-slate-600 select-none w-12 text-right pr-4 shrink-0 tabular-nums">
                      {lineNum}
                    </span>
                    <pre className="font-mono text-slate-200 whitespace-pre-wrap break-all grow">
                      {text || ' '}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Guide: Running the Code on Local LAN Network */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-xs space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-blue-700" />
          <h3 className="text-sm font-bold text-slate-900">
            راهنمای سریع راه‌اندازی و اجرای سورس کد در شبکه محلی کارگاه (LAN)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="font-bold text-blue-900 text-xs">۱. استخراج بسته در سرور کارگاه</div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              فایل <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">HR-Rezvan-LAN-Enterprise-Release-1405.zip</code> را در پوشه دلخواه سرور (مثلاً <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">C:\HR-Rezvan</code>) از حالت فشرده خارج کنید.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="font-bold text-blue-900 text-xs">۲. راه‌اندازی با یک کلیک</div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              فایل <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">scripts/run-lan.bat</code> را اجرا کنید. این اسکریپت سرور محلی را روی پورت ۸۰۰۰ فعال کرده و آدرس شبکه را نمایش می‌دهد.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="font-bold text-blue-900 text-xs">۳. دسترسی کاربران در کارگاه</div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              کاربران اداری و سرپرستان کارگاه در مرورگر خود آدرس سرور را وارد می‌کنند (مانند <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">http://192.168.1.50:8000</code>) بدون نیاز به اینترنت یا نصب نرم‌افزار اضافی.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
