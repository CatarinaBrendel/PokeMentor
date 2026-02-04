(async ()=>{
  try{
    const D = await import('@pkmn/dex');
    const id = (D.toID || ((s)=>String(s).toLowerCase()))('Abomasnow');
    let sp = null;
    if (D.species && typeof D.species.get === 'function') sp = D.species.get(id) || D.species.get('Abomasnow');
    if (!sp && D.Species && typeof D.Species.get === 'function') sp = D.Species.get(id) || D.Species.get('Abomasnow');
    if (!sp && typeof D.getSpecies === 'function') sp = D.getSpecies(id) || D.getSpecies('Abomasnow');
    console.log('MODULE KEYS:', Object.keys(D));
    console.log('Species export type:', typeof D.Species);
    console.log('Species.get exists:', !!(D.Species && D.Species.get));
    console.log('Dex export type:', typeof D.Dex);
    try { console.log('Dex keys:', Object.keys(D.Dex || {})); } catch(e){}
    try {
      const id = D.toID ? D.toID('Abomasnow') : 'abomasnow';
      console.log('toID:', id);
      const dd = D.Dex || {};
      const s1 = dd.species && dd.species[id];
      console.log('D.Dex.species[id] exists?', !!s1);
      if (s1) console.log('types:', s1.types || s1.type || s1.t);
    } catch (e) {}
    try { console.log('default keys:', Object.keys(D.default || {})); } catch(e){}
    console.log('default export type:', typeof D.default);
    if (D.default && typeof D.default === 'function') {
      console.log('default has keys', Object.keys(D.default));
    }
    if (D.Dex && typeof D.Dex.forGen === 'function') {
      try {
        const dex = D.Dex.forGen(9);
        const id2 = dex.toID ? dex.toID('Abomasnow') : 'abomasnow';
        const s = dex.species.get ? dex.species.get(id2) || dex.species.get('Abomasnow') : dex.species[id2];
        console.log('dex.forGen(9).species.get found?', !!s);
        if (s) console.log('types:', s.types || s.type || s.t);
      } catch (e) {
        console.error('Dex.forGen error', e);
      }
    }
    console.log('FOUND', !!sp);
    console.log('SPECIES GETTERS?', !!(D.species || D.Species || D.getSpecies));
    console.log('RESULT:', sp);
  }catch(e){
    console.error('ERR', e);
    process.exit(1);
  }
})();
