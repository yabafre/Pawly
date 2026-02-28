const sharp = require('sharp');
const fs = require('fs');

// Comprehensive list of iOS device sizes (logical width/height upscaled to physical by pixel ratio)
const devices = [
    // iPads
    { mw: 1024, mh: 1366, r: 2, name: 'ipad-pro-12.9' }, // 12.9"
    { mw: 834, mh: 1194, r: 2, name: 'ipad-pro-11' }, // 11", 10.9"
    { mw: 820, mh: 1180, r: 2, name: 'ipad-air-10.9' }, // Air 10.9" (some models)
    { mw: 810, mh: 1080, r: 2, name: 'ipad-10.2' }, // 10.2"
    { mw: 768, mh: 1024, r: 2, name: 'ipad-mini' }, // Mini, Air, 9.7"
    { mw: 744, mh: 1133, r: 2, name: 'ipad-mini-8.3' }, // Mini 8.3"

    // iPhones
    { mw: 440, mh: 956, r: 3, name: 'iphone-16-pro-max' }, // 16 Pro Max
    { mw: 402, mh: 874, r: 3, name: 'iphone-16-pro' }, // 16 Pro
    { mw: 430, mh: 932, r: 3, name: 'iphone-15-pro-max' }, // 15 Pro Max, 14 Pro Max, 16 Plus
    { mw: 393, mh: 852, r: 3, name: 'iphone-15-pro' }, // 15 Pro, 14 Pro, 16
    { mw: 428, mh: 926, r: 3, name: 'iphone-14-plus' }, // 14 Plus, 13 Pro Max, 12 Pro Max
    { mw: 390, mh: 844, r: 3, name: 'iphone-14' }, // 14, 13, 13 Pro, 12, 12 Pro
    { mw: 375, mh: 812, r: 3, name: 'iphone-13-mini' }, // 13 mini, 12 mini, 11 Pro, XS, X
    { mw: 414, mh: 896, r: 3, name: 'iphone-11-pro-max' }, // 11 Pro Max, XS Max
    { mw: 414, mh: 896, r: 2, name: 'iphone-11' }, // 11, XR
    { mw: 414, mh: 736, r: 3, name: 'iphone-8-plus' }, // 8 Plus, 7 Plus, 6s Plus
    { mw: 375, mh: 667, r: 2, name: 'iphone-8' } // SE, 8, 7, 6s
];

const svgBuffer = fs.readFileSync('public/icons/logo.svg');

async function go() {
    if (!fs.existsSync('public/splash')) fs.mkdirSync('public/splash', { recursive: true });

    for (let device of devices) {
        let w = Math.round(device.mw * device.r);
        let h = Math.round(device.mh * device.r);

        try {
            // Portrait
            const logoSizeP = Math.round(Math.min(w, h) * 0.3);
            const logoP = await sharp(svgBuffer)
                .resize({ width: logoSizeP, height: logoSizeP, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            await sharp({
                create: { width: w, height: h, channels: 4, background: { r: 253, g: 253, b: 253, alpha: 1 } }
            })
                .composite([{ input: logoP, gravity: 'center' }])
                .png()
                .toFile(`public/splash/${device.name}-portrait.png`);

            // Landscape
            const logoSizeL = Math.round(Math.min(h, w) * 0.3); // min is always the width
            const logoL = await sharp(svgBuffer)
                .resize({ width: logoSizeL, height: logoSizeL, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            await sharp({
                create: { width: h, height: w, channels: 4, background: { r: 253, g: 253, b: 253, alpha: 1 } }
            })
                .composite([{ input: logoL, gravity: 'center' }])
                .png()
                .toFile(`public/splash/${device.name}-landscape.png`);

        } catch (e) {
            console.error(`Failed on ${device.name}`, e);
        }
    }
}

go();
