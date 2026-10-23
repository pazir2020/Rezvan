"""Read-only team analytics should not infer worker-hours, bonus or defect rates."""
from datetime import date
from app.analytics.team_metrics import summarize

def test_reports_are_independent_and_dates_are_required():
    rows=[{'id':1,'oven_model':'تنور سنگک متحرک مینی','facade_name':'نمونه', 'forge_team':1,'masonry_team':3,
           'forge_status':'accepted','masonry_status':'finished','forge_start':date(2026,9,1),
           'forge_finish':date(2026,9,3),'handed_over':date(2026,9,3), 'masonry_start':date(2026,10,1),
           'masonry_finish':date(2026,10,4),'brickwork':True,'cementwork':True,'insulation':True,'facade_done':True},
          {'id':2,'oven_model':'تنور سنگک متحرک بزرگ','facade_name':'نمونه','forge_team':2,'masonry_team':1,
           'forge_status':'correction','masonry_status':'pending','forge_start':None,'forge_finish':None,
           'handed_over':None,'masonry_start':None,'masonry_finish':None,
           'brickwork':False,'cementwork':False,'insulation':False,'facade_done':False}]
    d=summarize(rows,start=date(2026,10,1),end=date(2026,10,31))
    teams={(x['kind'],x['number']):x for x in d['teams']}
    assert teams['forge',1]['completed_with_date']==0
    assert teams['masonry',3]['completed_with_date']==1
    assert teams['forge',2]['correction_now']==1
    assert teams['masonry',3]['elapsed_calendar_days_avg']==4
    assert 'نفرساعت اضافه‌کاری هر سفارش/تیم' in d['missing']
    assert len(d['teams'])==5

