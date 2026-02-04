(async ()=>{
  try{
    const D = await import('@pkmn/dex');
    if (!D.Dex || typeof (D.Dex).forGen !== 'function') {
      console.log('Dex.forGen not available');
      return;
    }
    for (let g=1; g<=9; g++) {
      try{
        const dex = (D.Dex).forGen(g);
        const id = dex.toID ? dex.toID('Abomasnow') : 'abomasnow';
        const sp = typeof dex.species?.get === 'function' ? dex.species.get(id) ?? dex.species.get('Abomasnow') : dex.species?.[id];
        console.log('gen', g, 'found?', !!sp);
        if (sp) {
          const keys = Object.keys(sp);
          console.log('  keys:', keys.slice(0,10));
          console.log('  gen/generation:', sp.gen ?? sp.generation ?? sp['generation']);
          console.log('  isNonstandard:', sp.isNonstandard ?? sp['isNonstandard']);
          console.log('  types:', sp.types ?? sp.type ?? sp.t);
        }
      }catch(e){console.log('gen', g, 'error', e && e.message)}
    }
  }catch(e){console.error(e)}
})();
