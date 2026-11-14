import sys
from PIL import Image, ImageFilter; import numpy as np
from scipy import ndimage
S=sys.argv[1]
im=Image.open('city.png').convert('RGBA'); c=np.array(im).astype(float)
rgb=c[...,:3]; al=c[...,3]
sky=np.array(Image.open('sky-mask.png'))[...,3]/255.
r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]; lum=rgb.mean(2)
lit=(lum>105)&(r>b*1.05)
lit=ndimage.binary_dilation(lit,iterations=1)
# inpaint lit pixels with blurred non-lit neighbourhood
w=(~lit).astype(float)
den=ndimage.gaussian_filter(w,5)+1e-4
tl=ndimage.gaussian_filter(lum*w,5)/den
tl=np.where(den<0.05,lum*0.45,tl)
scale=np.where(lit,np.clip((tl*1.15)/(lum+1),0.15,1),1.0)
g0=lum[...,None]
out=np.where(lit[...,None],(rgb*0.35+g0*0.65)*scale[...,None],rgb)
# day grade: lift, neutralise blue, add slight warm haze w/ distance (higher in image = farther)
l=out.mean(2,keepdims=True)
gray=np.concatenate([l*1.0,l*1.0,l*1.02],2)
mix=0.45*gray+0.55*out*np.array([0.95,1.0,1.08])
mix=255*np.power(np.clip(mix/255,0,1),0.6)  # brighten
mix=mix*np.array([1.02,1.0,0.97])
yy=np.linspace(0,1,c.shape[0])[:,None,None]
haze=np.clip(1-(yy/0.55),0,1)*0.28
mix=mix*(1-haze)+np.array([205,215,228])*haze
res=np.dstack([np.clip(mix,0,255),al*(1-sky)]).astype(np.uint8)
solid=(al*(1-sky))>=250
_,(iy,ix)=ndimage.distance_transform_edt(~solid,return_indices=True)
edge=~solid
res[edge,:3]=res[iy[edge],ix[edge],:3]
Image.fromarray(res).save('city-day.png',optimize=True)
night=np.dstack([rgb,al*(1-sky)]).astype(np.uint8)
night[edge,:3]=night[iy[edge],ix[edge],:3]
Image.fromarray(night).save('city-night.png',optimize=True)
# preview over sky blue
bg=Image.new('RGBA',im.size,(140,185,230,255)); bg.alpha_composite(Image.fromarray(res)); bg.convert('RGB').crop((0,0,1672,620)).save(S+'/day_prev.jpg',quality=85)
