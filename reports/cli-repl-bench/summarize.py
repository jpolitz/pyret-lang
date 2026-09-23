import json,sys,statistics as st
sections={}
cur=None
for line in open(sys.argv[1]):
    line=line.strip()
    if line.startswith('===') or line.startswith('###'):
        cur=line.strip('=# ').strip(); sections.setdefault(cur,[])
    elif line.startswith('{'):
        try: sections[cur].append(json.loads(line))
        except Exception: pass
def fmt(v): return '%.0f'%v
for name,runs in sections.items():
    if not runs: continue
    print('---',name,'(n=%d)'%len(runs))
    su=[r['startupMs'] for r in runs]
    print('   startup ms: median %s  min %s  max %s'%(fmt(st.median(su)),fmt(min(su)),fmt(max(su))))
    # per-expression across runs
    by={}
    for r in runs:
        for e in r['exprs']: by.setdefault(e['expr'],[]).append(e['ms'])
    allms=[m for v in by.values() for m in v]
    print('   per-expression ms: median %s  p-min %s  p-max %s'%(fmt(st.median(allms)),fmt(min(allms)),fmt(max(allms))))
    for k,v in by.items():
        print('      %7s   %s'%(fmt(st.median(v)),k))
    tot=[r['totalMs'] for r in runs]
    print('   whole session ms: median %s'%fmt(st.median(tot)))
