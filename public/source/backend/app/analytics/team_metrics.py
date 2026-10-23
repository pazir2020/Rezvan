"""Pure aggregation of per-team order data; no database imports."""

def summarize(orders, start=None, end=None):
    def in_window(d):
        return d is not None and (start is None or d >= start) and (end is None or d <= end)
    teams=[]
    for kind, count in (('forge',2),('masonry',3)):
        for number in range(1,count+1):
            selected=[o for o in orders if o[f'{kind}_team']==number]
            completed=[]
            for o in selected:
                status=o[f'{kind}_status']
                finish=o[f'{kind}_finish']
                done=status in (('ready','accepted') if kind=='forge' else ('finished',))
                if done and in_window(finish):
                    completed.append(o)
            # Missing completion dates must not silently become '0 output'.
            undated=sum(1 for o in selected if o[f'{kind}_status'] in (('ready','accepted') if kind=='forge' else ('finished',)) and not o[f'{kind}_finish'])
            revisions=sum(1 for o in selected if o[f'{kind}_status']=='correction')
            active=sum(1 for o in selected if o[f'{kind}_status']=='working')
            models={}
            for o in completed:
                models[o['oven_model']]=models.get(o['oven_model'],0)+1
            durs=[]
            for o in completed:
                a=o[f'{kind}_start']; b=o[f'{kind}_finish']
                if a and b and b>=a:durs.append((b-a).days+1)
            teams.append({'kind':kind,'number':number,'name':('آهنگری ' if kind=='forge' else 'بنایی ')+str(number),
                'assigned_total_all_time':len(selected),'completed_with_date':len(completed),
                'completed_missing_date_all_time':undated,'active_now':active,'correction_now':revisions,
                'model_counts':models,'elapsed_calendar_days_avg':round(sum(durs)/len(durs),1) if durs else None,
                'elapsed_sample_count':len(durs)})
    return {'teams':teams, 'date_start': start, 'date_end':end,
        'quality_note':'وضعیت نیازمند اصلاح، نرخ نقص یا دوباره‌کاری نیست؛ تاریخچه کامل ایرادها هنوز ساخت‌یافته نیست.',
        'missing':['نفرساعت موظفی هر سفارش/تیم','نفرساعت اضافه‌کاری هر سفارش/تیم','زمان استاندارد تأییدشده مدل تنور','کنترل کیفیت مستقل و تعداد اصلاحات'],
        'scope':'تعداد تکمیل‌شده فقط از وضعیت تکمیل با تاریخ پایان معتبر به دست می‌آید؛ وضعیت‌های جاری مربوط به همه سفارش‌ها هستند.'}
