import sys,os,re
rot=sys.argv[1] if len(sys.argv)>1 else '0'
t=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'template.html'),encoding='utf-8').read()
sim=re.sub(r'(?m)^if \(typeof module.*$', '', open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'sim.js'),encoding='utf-8').read())
t=t.replace('/*__TRACK__*/',open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'spa_line.json')).read()).replace('/*__SIM__*/',sim).replace('/*__ROT__*/0',rot)

open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'index.html'),'w',encoding='utf-8').write(t)
print(len(t))
