import { useSearchParams } from 'react-router-dom';
import { selectionParams, type Selection } from './selection';
export function useSelectionUpdate(s:Selection) {
  const [,setSearch]=useSearchParams();
  return (patch:Partial<Selection>)=>{
    const next={...s,...patch};
    if(patch.domain){next.compare='';next.comparisonPeriod='';next.comparisonDate='';if(patch.domain==='fuel'&&next.country==='EU27_2020')next.country='DE';if(patch.domain==='inflation'){next.start=next.start.slice(0,7)+'-01';next.end=next.end.slice(0,7)+'-01';}}
    if(patch.measurement==='index'||patch.country===next.compare)next.compare='';
    setSearch(selectionParams(next));
  };
}
