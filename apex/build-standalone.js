const fs=require('fs');
const dir='/home/user/HideCat/apex/';
let html=fs.readFileSync(dir+'index.html','utf8');
const css=fs.readFileSync(dir+'style.css','utf8');
const audio=fs.readFileSync(dir+'js/audio.js','utf8');
const input=fs.readFileSync(dir+'js/input.js','utf8');
const game=fs.readFileSync(dir+'js/game.js','utf8');
// inline css
html=html.replace('<link rel="stylesheet" href="style.css">', '<style>\n'+css+'\n</style>');
// inline scripts
html=html.replace('<script src="js/audio.js"></script>','<script>\n'+audio+'\n</script>');
html=html.replace('<script src="js/input.js"></script>','<script>\n'+input+'\n</script>');
html=html.replace('<script src="js/game.js"></script>','<script>\n'+game+'\n</script>');
fs.writeFileSync(dir+'APEX-绝巅.html', html);
console.log('built APEX-绝巅.html  ('+(html.length/1024).toFixed(0)+' KB, 单文件)');
