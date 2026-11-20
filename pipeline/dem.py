from geo import *
near=mosaic('dem',14,4096,1024)[...,0]; np.save('out/dem_near.npy',near)
far=mosaic('dem',11,40960,1024)[...,0]; np.save('out/dem_far.npy',far)
print('near',near.min(),near.max(),'site',near[512,512],near[500:524,500:524].min(),near[500:524,500:524].max())
print('far',far.min(),far.max())
s=mosaic('sat',14,4096,2048); Image.fromarray(s.astype(np.uint8)).save('out/sat_near.png')
s=mosaic('sat',11,40960,2048); Image.fromarray(s.astype(np.uint8)).save('out/sat_far.png')
