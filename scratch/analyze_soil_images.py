import os
import glob
from PIL import Image
import numpy as np

base_dir = r"c:\Users\hamza\Desktop\agrinexus_8am_copy\Soil Types"
folders = ["Alluvial soil", "Clayey soils", "Laterite soil", "Loamy soil", "Sandy loam", "Sandy soil"]

print(f"{'Soil Type':<20} | {'Count':<5} | {'R Avg':<6} | {'G Avg':<6} | {'B Avg':<6} | {'Bright':<6} | {'StdDev':<6}")
print("-" * 75)

for folder in folders:
    path = os.path.join(base_dir, folder)
    img_files = glob.glob(os.path.join(path, "*.png")) + glob.glob(os.path.join(path, "*.jpg")) + glob.glob(os.path.join(path, "*.jpeg"))
    
    r_vals, g_vals, b_vals = [], [], []
    bright_vals, std_vals = [], []
    
    for f in img_files:
        try:
            img = Image.open(f).convert('RGB').resize((100, 100))
            arr = np.array(img)
            
            # Compute channel averages
            r = arr[:, :, 0].mean()
            g = arr[:, :, 1].mean()
            b = arr[:, :, 2].mean()
            
            # Brightness array
            bright = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
            avg_bright = bright.mean()
            std_bright = bright.std()
            
            r_vals.append(r)
            g_vals.append(g)
            b_vals.append(b)
            bright_vals.append(avg_bright)
            std_vals.append(std_bright)
        except Exception:
            continue
            
    if r_vals:
        print(f"{folder:<20} | {len(r_vals):<5} | {np.mean(r_vals):.1f}  | {np.mean(g_vals):.1f}  | {np.mean(b_vals):.1f}  | {np.mean(bright_vals):.1f}  | {np.mean(std_vals):.1f}")
    else:
        print(f"{folder:<20} | 0     | N/A    | N/A    | N/A    | N/A    | N/A")
