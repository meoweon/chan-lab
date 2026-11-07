import io
r = lambda p: io.open(p, encoding='utf-8').read()
h = r('index.template.html')
for mark, f in [('/*__ENGINE__*/', 'src/chan-engine.js'), ('/*__GEN__*/', 'src/chan-generator.js'), ('/*__RULES__*/', 'src/chan-rules.js'), ('/*__STATE__*/', 'src/chan-state.js'), ('/*__ROBUST__*/', 'src/chan-robust.js'), ('/*__NOISE__*/', 'src/chan-noise.js'), ('/*__CSV__*/', 'src/chan-csv.js'), ('/*__MX__*/', 'src/chan-microscope.js'), ('/*__APP__*/', 'src/app.js')]:
    h = h.replace(mark, r(f))
io.open('chan-lab.html', 'w', encoding='utf-8').write(h)
print('chan-lab.html', len(h))
