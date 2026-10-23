import React, { useState } from 'react';
import { OvenOrder, OvenModel, ForgeStatus, MasonryStatus } from '../../types';
import { toPersianDigits } from '../../utils/formatters';
import { Flame, Plus, Search, Filter, CheckCircle2, AlertCircle, Clock, Truck, ShieldAlert, ArrowLeftRight } from 'lucide-react';

interface OvenTrackingViewProps {
  orders: OvenOrder[];
  onSaveOrder: (order: OvenOrder) => void;
}

export const OvenTrackingView: React.FC<OvenTrackingViewProps> = ({ orders, onSaveOrder }) => {
  const [orderList, setOrderList] = useState<OvenOrder[]>(orders);
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OvenOrder | null>(null);

  // New order form state
  const [customerName, setCustomerName] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [ovenModel, setOvenModel] = useState<OvenModel>('تنور سنگک متحرک متوسط');
  const [facadeName, setFacadeName] = useState('');
  const [forgeTeam, setForgeTeam] = useState<1 | 2>(1);
  const [masonryTeam, setMasonryTeam] = useState<1 | 2 | 3 | undefined>(1);
  const [forgeStatus, setForgeStatus] = useState<ForgeStatus>('working');
  const [masonryStatus, setMasonryStatus] = useState<MasonryStatus>('pending');
  const [brickwork, setBrickwork] = useState(false);
  const [cementwork, setCementwork] = useState(false);
  const [insulation, setInsulation] = useState(false);
  const [facadeDone, setFacadeDone] = useState(false);
  const [qualityNote, setQualityNote] = useState('');
  const [formError, setFormError] = useState('');

  const openNewModal = () => {
    setEditingOrder(null);
    setCustomerName('');
    setCustomerCity('');
    setOvenModel('تنور سنگک متحرک متوسط');
    setFacadeName('آجر قزاقی سنتی گلدار');
    setForgeTeam(1);
    setMasonryTeam(1);
    setForgeStatus('working');
    setMasonryStatus('pending');
    setBrickwork(false);
    setCementwork(false);
    setInsulation(false);
    setFacadeDone(false);
    setQualityNote('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (ord: OvenOrder) => {
    setEditingOrder(ord);
    setCustomerName(ord.customerName);
    setCustomerCity(ord.customerCity);
    setOvenModel(ord.ovenModel);
    setFacadeName(ord.facadeName);
    setForgeTeam(ord.forgeTeam);
    setMasonryTeam(ord.masonryTeam);
    setForgeStatus(ord.forgeStatus);
    setMasonryStatus(ord.masonryStatus);
    setBrickwork(ord.brickwork);
    setCementwork(ord.cementwork);
    setInsulation(ord.insulation);
    setFacadeDone(ord.facadeDone);
    setQualityNote(ord.qualityNote);
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!customerName.trim()) {
      setFormError('نام مشتری الزامی است.');
      return;
    }
    if (!facadeName.trim()) {
      setFormError('عنوان نماکاری آزاد الزامی است.');
      return;
    }
    // Validation rule: If masonry is marked finished, all 4 construction steps must be true!
    if (masonryStatus === 'finished' && (!brickwork || !cementwork || !insulation || !facadeDone)) {
      setFormError('خطای اعتبارسنجی: برای ثبت وضعیت «اتمام بنایی»، باید تمامی ۴ مرحله آجرچینی، سیمان‌کاری، عایق‌کاری و نماکاری تایید شده باشند.');
      return;
    }

    const newOrder: OvenOrder = {
      id: editingOrder ? editingOrder.id : Date.now(),
      orderNumber: editingOrder ? editingOrder.orderNumber : `RZ-OV-1405-0${orderList.length + 40}`,
      customerName,
      customerCity: customerCity || 'تهران',
      ovenModel,
      facadeName,
      forgeTeam,
      masonryTeam: masonryStatus !== 'pending' ? masonryTeam : masonryTeam,
      forgeStatus,
      masonryStatus,
      brickwork,
      cementwork,
      insulation,
      facadeDone,
      qualityNote,
      notes: editingOrder?.notes || '',
      createdAt: editingOrder?.createdAt || '1405/07/22',
      version: (editingOrder?.version || 0) + 1
    };

    if (editingOrder) {
      setOrderList(orderList.map((o) => (o.id === editingOrder.id ? newOrder : o)));
    } else {
      setOrderList([newOrder, ...orderList]);
    }

    onSaveOrder(newOrder);
    setModalOpen(false);
  };

  const filteredOrders = orderList.filter((ord) => {
    const matchSearch =
      ord.customerName.includes(searchTerm) ||
      ord.orderNumber.includes(searchTerm) ||
      ord.facadeName.includes(searchTerm);
    const matchModel = modelFilter === 'all' || ord.ovenModel === modelFilter;
    const matchStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'forge'
        ? ord.forgeStatus === 'working' || ord.forgeStatus === 'pending'
        : statusFilter === 'ready_handover'
        ? ord.forgeStatus === 'ready' && ord.masonryStatus === 'pending'
        : statusFilter === 'masonry'
        ? ord.masonryStatus === 'working'
        : ord.masonryStatus === 'finished';

    return matchSearch && matchModel && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header & Workshop Principles */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-800">
              <Flame className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              مدیریت و رهگیری ساخت تنور سنگک صنعتی (مدل تولید غیرپیوسته کارگاهی رضوان)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-4xl leading-relaxed">
            ساخت تنور در رضوان یک خط مونتاژ پیوسته نیست؛ <strong>۲ تیم ۴ نفره آهنگری</strong> به‌صورت مستقل شاسی‌های فولادی را می‌سازند و <strong>۳ تیم ۴ نفره بنایی</strong> شاسی تکمیل‌شده را تحویل گرفته و ۴ مرحله آجرچینی، سیمان‌کاری، عایق‌کاری و نماکاری را اجرا می‌کنند.
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت سفارش ساخت جدید</span>
        </button>
      </div>

      {/* Production Milestone Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs">
          <span className="text-slate-500 block text-[11px]">شاسی‌های در حال آهنگری:</span>
          <span className="text-xl font-bold text-amber-700 tabular-nums">
            {toPersianDigits(orderList.filter((o) => o.forgeStatus === 'working').length)} دستگاه
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">تیم ۱: ۲ مورد | تیم ۲: ۱ مورد</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs">
          <span className="text-slate-500 block text-[11px]">شاسی آماده تحویل به بنایی:</span>
          <span className="text-xl font-bold text-blue-700 tabular-nums">
            {toPersianDigits(orderList.filter((o) => o.forgeStatus === 'ready' && o.masonryStatus === 'pending').length)} دستگاه
          </span>
          <span className="text-[10px] text-blue-700 block mt-1">گلوگاه انتقال شاسی</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs">
          <span className="text-slate-500 block text-[11px]">در حال بنایی و عایق‌کاری:</span>
          <span className="text-xl font-bold text-indigo-700 tabular-nums">
            {toPersianDigits(orderList.filter((o) => o.masonryStatus === 'working').length)} دستگاه
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">۳ تیم بنایی فعال</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs">
          <span className="text-slate-500 block text-[11px]">تکمیل‌شده و تحویل مشتری:</span>
          <span className="text-xl font-bold text-emerald-700 tabular-nums">
            {toPersianDigits(orderList.filter((o) => o.masonryStatus === 'finished').length)} دستگاه
          </span>
          <span className="text-[10px] text-emerald-700 block mt-1">پاس تست حرارتی نهایی</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="جستجو با نام مشتری، شهر، شماره سفارش یا نماکاری..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none"
          >
            <option value="all">همه مدل‌های کاتالوگ</option>
            <option value="تنور سنگک متحرک بزرگ">تنور سنگک متحرک بزرگ</option>
            <option value="تنور سنگک متحرک متوسط">تنور سنگک متحرک متوسط</option>
            <option value="تنور سنگک متحرک کوچک">تنور سنگک متحرک کوچک</option>
            <option value="تنور سنگک متحرک مینی">تنور سنگک متحرک مینی</option>
            <option value="تنور سنگک ثابت آپشنال">تنور سنگک ثابت آپشنال</option>
            <option value="لارج">لارج</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="forge">در حال ساخت شاسی (آهنگری)</option>
            <option value="ready_handover">شاسی آماده تحویل به بنایی</option>
            <option value="masonry">در حال عملیات بنایی و عایق</option>
            <option value="finished">تکمیل‌شده نهایی</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                <th className="py-3 px-3.5">سفارش و مدل</th>
                <th className="py-3 px-3.5">مشتری و مقصد</th>
                <th className="py-3 px-3.5">تیم آهنگری</th>
                <th className="py-3 px-3.5">تیم بنایی</th>
                <th className="py-3 px-3.5">۴ مرحله بنایی</th>
                <th className="py-3 px-3.5">نماکاری آزاد</th>
                <th className="py-3 px-3.5">وضعیت کلی</th>
                <th className="py-3 px-3.5">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3.5">
                    <div className="font-mono text-xs font-bold text-blue-900">{ord.orderNumber}</div>
                    <div className="font-medium text-slate-800 text-[11px] mt-0.5">{ord.ovenModel}</div>
                  </td>
                  <td className="py-3 px-3.5">
                    <div className="font-medium text-slate-900">{ord.customerName}</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">{ord.customerCity}</div>
                  </td>
                  <td className="py-3 px-3.5">
                    <div className="font-medium text-slate-800">تیم {toPersianDigits(ord.forgeTeam)} آهنگری</div>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-medium inline-block mt-0.5 ${
                        ord.forgeStatus === 'ready'
                          ? 'bg-emerald-100 text-emerald-800'
                          : ord.forgeStatus === 'working'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {ord.forgeStatus === 'ready'
                        ? 'شاسی آماده'
                        : ord.forgeStatus === 'working'
                        ? 'در حال شاسی‌سازی'
                        : 'در انتظار'}
                    </span>
                  </td>
                  <td className="py-3 px-3.5">
                    {ord.masonryTeam ? (
                      <div>
                        <div className="font-medium text-slate-800">تیم {toPersianDigits(ord.masonryTeam)} بنایی</div>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-medium inline-block mt-0.5 ${
                            ord.masonryStatus === 'finished'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ord.masonryStatus === 'working'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {ord.masonryStatus === 'finished'
                            ? 'اتمام بنایی'
                            : ord.masonryStatus === 'working'
                            ? 'در حال اجرا'
                            : 'در انتظار تحویل'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">تخصیص‌نیافته</span>
                    )}
                  </td>
                  <td className="py-3 px-3.5">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`px-1 rounded ${ord.brickwork ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                        آجر {ord.brickwork ? '✓' : '✗'}
                      </span>
                      <span className={`px-1 rounded ${ord.cementwork ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                        سیمان {ord.cementwork ? '✓' : '✗'}
                      </span>
                      <span className={`px-1 rounded ${ord.insulation ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                        عایق {ord.insulation ? '✓' : '✗'}
                      </span>
                      <span className={`px-1 rounded ${ord.facadeDone ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                        نما {ord.facadeDone ? '✓' : '✗'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3.5 text-slate-700 max-w-[160px] truncate" title={ord.facadeName}>
                    {ord.facadeName}
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    {ord.masonryStatus === 'finished' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        تکمیل و تایید
                      </span>
                    ) : ord.forgeStatus === 'ready' && ord.masonryStatus === 'pending' ? (
                      <span className="inline-flex items-center gap-1 text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-bold">
                        <ArrowLeftRight className="w-3 h-3 text-blue-600" />
                        آماده تحویل به بنایی
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-medium">
                        <Clock className="w-3 h-3 text-amber-600" />
                        در حال ساخت
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap">
                    <button
                      onClick={() => openEditModal(ord)}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors cursor-pointer"
                    >
                      ویرایش و مراحل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New / Edit Oven Order */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-600" />
                <span>{editingOrder ? `ویرایش سفارش ساخت تنور (${editingOrder.orderNumber})` : 'ثبت سفارش جدید ساخت تنور سنگک'}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">نام مشتری یا مجموعه نانوایی *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="مثال: نانوایی سنگک بهارستان"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">شهر / محل نصب</label>
                  <input
                    type="text"
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                    placeholder="مثال: تهران، تجریش"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">مدل تنور (طبق کاتالوگ رسمی) *</label>
                  <select
                    value={ovenModel}
                    onChange={(e) => setOvenModel(e.target.value as OvenModel)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 bg-white"
                  >
                    <option value="تنور سنگک متحرک بزرگ">تنور سنگک متحرک بزرگ</option>
                    <option value="تنور سنگک متحرک متوسط">تنور سنگک متحرک متوسط</option>
                    <option value="تنور سنگک متحرک کوچک">تنور سنگک متحرک کوچک</option>
                    <option value="تنور سنگک متحرک مینی">تنور سنگک متحرک مینی</option>
                    <option value="تنور سنگک ثابت آپشنال">تنور سنگک ثابت آپشنال</option>
                    <option value="لارج">لارج (فایل کارانه)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">عنوان نماکاری آزاد (طرح سفارشی) *</label>
                  <input
                    type="text"
                    required
                    value={facadeName}
                    onChange={(e) => setFacadeName(e.target.value)}
                    placeholder="مثال: آجر قزاقی سنتی با کتیبه برنجی"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Forge Team & Status */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="font-bold text-slate-900">مرحله ۱: آهنگری و ساخت شاسی (۲ تیم ۴ نفره)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1">تیم آهنگری مسئول:</label>
                    <select
                      value={forgeTeam}
                      onChange={(e) => setForgeTeam(parseInt(e.target.value) as 1 | 2)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    >
                      <option value={1}>تیم ۱ آهنگری (سرپرست جواد ناظمی - ۴ نفر)</option>
                      <option value={2}>تیم ۲ آهنگری (سرپرست حمید اکبری - ۴ نفر)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">وضعیت ساخت شاسی:</label>
                    <select
                      value={forgeStatus}
                      onChange={(e) => setForgeStatus(e.target.value as ForgeStatus)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    >
                      <option value="pending">در انتظار شروع</option>
                      <option value="working">در حال ساخت و جوشکاری CO2</option>
                      <option value="ready">شاسی آماده (تست تراز انجام شده)</option>
                      <option value="accepted">تحویل شده به واحد بنایی</option>
                      <option value="correction">نیازمند اصلاح مهندسی</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Masonry Team & 4 Stages */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="font-bold text-slate-900">مرحله ۲: بنایی، عایق‌کاری و نما (۳ تیم ۴ نفره)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="block text-slate-600 mb-1">تیم بنایی تحویل‌گیرنده شاسی:</label>
                    <select
                      value={masonryTeam || 1}
                      onChange={(e) => setMasonryTeam(parseInt(e.target.value) as 1 | 2 | 3)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    >
                      <option value={1}>تیم ۱ بنایی (سرپرست احمد رستمی - ۴ نفر)</option>
                      <option value={2}>تیم ۲ بنایی (سرپرست صادق فراهانی - ۴ نفر)</option>
                      <option value={3}>تیم ۳ بنایی (سرپرست مصطفی امینی - ۴ نفر)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">وضعیت کل بنایی:</label>
                    <select
                      value={masonryStatus}
                      onChange={(e) => setMasonryStatus(e.target.value as MasonryStatus)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    >
                      <option value="pending">در انتظار شاسی فولادی</option>
                      <option value="working">در حال عملیات بنایی</option>
                      <option value="finished">اتمام بنایی (نیازمند تایید هر ۴ مرحله)</option>
                      <option value="correction">نیازمند اصلاح و ترمیم</option>
                    </select>
                  </div>
                </div>

                {/* 4 Checkbox milestones */}
                <div className="pt-2 border-t border-slate-200/80">
                  <span className="block text-slate-700 font-semibold mb-1.5">
                    تایید ۴ مرحله اصلی بنایی (الزامی برای اتمام):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded bg-white border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={brickwork}
                        onChange={(e) => setBrickwork(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>۱. آجرچینی نسوز</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded bg-white border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cementwork}
                        onChange={(e) => setCementwork(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>۲. سیمان‌کاری لیسه‌ای</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded bg-white border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={insulation}
                        onChange={(e) => setInsulation(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>۳. عایق‌کاری پشم سرامیک</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded bg-white border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={facadeDone}
                        onChange={(e) => setFacadeDone(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>۴. نماکاری و کتیبه</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Quality Note */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">یادداشت کنترل کیفیت و تست حرارتی</label>
                <textarea
                  rows={2}
                  value={qualityNote}
                  onChange={(e) => setQualityNote(e.target.value)}
                  placeholder="تست تراز شاسی، ضخامت پشم سرامیک، تست نشت مشعل گاز و دمای دهانه تنور..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer font-medium"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold cursor-pointer transition-colors shadow-xs"
                >
                  {editingOrder ? 'ذخیره تغییرات سفارش' : 'ثبت قطعی در کارگاه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
