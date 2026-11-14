import sys
from PIL import Image, ImageFilter; import numpy as np
from scipy import ndimage
S=sys.argv[1]
c=np.array(Image.open('city.png').convert('RGBA')).astype(float)
r,g,b,al=c[...,0],c[...,1],c[...,2],c[...,3]
lum=(r+g+b)/3
m1=ndimage.uniform_filter(lum,5); m2=ndimage.uniform_filter(lum*lum,5); sd=np.sqrt(np.maximum(m2-m1*m1,0))
H,W=lum.shape
skycand=(sd<10)&(lum>55)
op=al>128
sky=np.zeros((H,W),bool)
RUN=int(sys.argv[2]) if len(sys.argv)>2 else 14
for x in range(W):
  y=0
  while y<H and not op[y,x]: y+=1
  start=y; last=y-1; bad=0
  while y<H and op[y,x]:
    if skycand[y,x]: last=y; bad=0
    else:
      bad+=1
      if bad>=RUN: break
    y+=1
  sky[start:last+1,x]=True
# remove sky beyond y>320 (nothing is sky below the horizon)
sky[320:]=False; sky[:,:262]=False
# light morphological open horizontally to kill 1px slivers
sky=ndimage.binary_opening(sky,np.ones((1,3)))
sky=ndimage.binary_dilation(sky,iterations=1)&(np.arange(H)[:,None]<322)
mask=Image.fromarray((sky*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
out=Image.new('RGBA',(W,H),(255,255,255,0)); out.putalpha(mask)
out.save('sky-mask.png')
over=np.array(Image.open('city.png').convert('RGB')).copy(); over[sky]=[255,0,0]
Image.fromarray(over[:400]).save(S+'/sky_over.jpg')
