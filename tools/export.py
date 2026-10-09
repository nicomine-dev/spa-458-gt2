import struct,json,math
d=open(r"E:/Programas/Steam/steamapps/common/assettocorsa/content/tracks/spa/ai/fast_lane.ai",'rb').read()
n=struct.unpack_from('<i',d,4)[0]
pts=[struct.unpack_from('<4fi',d,16+20*i) for i in range(n)]
off=16+20*n+4
ex=[struct.unpack_from('<18f',d,off+72*i) for i in range(n)]
# check side convention at a tight corner: compute signed curvature and compare sides
X=[p[0] for p in pts];Z=[p[2] for p in pts]
def head(i): j=(i+3)%n;k=(i-3)%n; return math.atan2(Z[j]-Z[k],X[j]-X[k])
res=[]
for i in range(0,n,1):
    a=head((i+4)%n)-head((i-4)%n); a=(a+math.pi)%(2*math.pi)-math.pi
    res.append(a)
# tightest few corners
idx=sorted(range(n),key=lambda i:-abs(res[i]))[:1]
for i in sorted(set(i//100*100 for i in sorted(range(n),key=lambda i:-abs(res[i]))[:400])):
    pass
for i in [int(n*f) for f in (0.04,0.05,0.06)]+idx:
    print(i,round(pts[i][3]),'dtheta',round(res[i],3),'L',round(ex[i][5],2),'R',round(ex[i][6],2),'radius',round(ex[i][4],1))
out={'x':[round(p[0],2) for p in pts],'y':[round(p[1],2) for p in pts],'z':[round(p[2],2) for p in pts],
 'l':[round(e[5],2) for e in ex],'r':[round(e[6],2) for e in ex]}
json.dump(out,open('spa_line.json','w'),separators=(',',':'))
import os;print(os.path.getsize('spa_line.json'))
