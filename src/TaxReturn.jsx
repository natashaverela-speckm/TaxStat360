import React from 'react'
import{useNavigate}from 'react-router-dom'
const e=React.createElement
const B='#2563EB',G='#16A34A',R='#DC2626',N='#0F172A',SL='#64748B'
const TAX_YR=new Date().getFullYear()-1
const nv=v=>parseFloat(v)||0
const fmt=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString()
const pct=n=>(Math.round(n*100)/100).toFixed(1)+'%'
const STD={single:14600,mfj:29200,mfs:7300,hoh:21900,qss:29200}
const BRACKETS={
  single:[[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]],
  mfj:[[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
  mfs:[[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[365600,0.35],[Infinity,0.37]],
  hoh:[[16550,0.10],[63100,0.12],[100500,0.22],[191950,0.24],[243700,0.32],[609350,0.35],[Infinity,0.37]],
  qss:[[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]]
}
const LTCG_BRACKETS={single:[[47025,0],[518900,0.15],[Infinity,0.20]],mfj:[[94050,0],[583750,0.15],[Infinity,0.20]],mfs:[[47025,0],[291850,0.15],[Infinity,0.20]],hoh:[[63000,0],[551350,0.15],[Infinity,0.20]],qss:[[94050,0],[583750,0.15],[Infinity,0.20]]}
function bTax(inc,st){const br=BRACKETS[st]||BRACKETS.single;let t=0,p=0;for(const[th,r]of br){if(inc<=p)break;t+=(Math.min(inc,th)-p)*r;p=th}return t}
function ltcgTax(ltcg,ordInc,st){const br=LTCG_BRACKETS[st]||LTCG_BRACKETS.single;let t=0,p=0;for(const[th,r]of br){if(ltcg<=0)break;const room=Math.max(0,th-Math.max(ordInc,p));const chunk=Math.min(ltcg,room);t+=chunk*r;ltcg-=chunk;p=th}return t}
function Tip({text}){
  const[show,setShow]=React.useState(false)
  return e('span',{style:{position:'relative',marginLeft:5}},
    e('span',{style:{cursor:'pointer',fontSize:12,color:B,fontWeight:700,background:'#EFF6FF',borderRadius:'50%',width:16,height:16,display:'inline-flex',alignItems:'center',justifyContent:'center'},onMouseEnter:()=>setShow(true),onMouseLeave:()=>setShow(false)},'?'),
    show&&e('div',{style:{position:'absolute',left:20,top:-8,background:'#1E293B',color:'#fff',padding:'8px 12px',borderRadius:8,fontSize:12,lineHeight:1.5,width:220,zIndex:999,boxShadow:'0 4px 16px rgba(0,0,0,0.2)'}},text)
  )
}
function Section({title,icon,open:initOpen=false,children}){
  const[open,setOpen]=React.useState(initOpen)
  return e('div',{style:{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',marginBottom:12,overflow:'hidden'}},
    e('div',{onClick:()=>setOpen(!open),style:{padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',userSelect:'none'}},
      e('div',{style:{display:'flex',alignItems:'center',gap:10}},
        e('div',{style:{width:26,height:26,background:B,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:'#fff'}},icon),
        e('span',{style:{fontSize:14,fontWeight:700,color:N}},title)
      ),
      e('span',{style:{fontSize:18,color:SL,transition:'transform 0.2s',transform:open?'rotate(180deg)':'none'}},'⌄')
    ),
    open&&e('div',{style:{padding:'4px 18px 18px'}},children)
  )
}
const Fi=(label,val,set,type='number',hi=false)=>e('div',{style:{marginBottom:14}},
  e('label',{style:{fontSize:12,fontWeight:700,color:SL,display:'block',marginBottom:5}},label),
  e('input',{value:val,onChange:x=>set(x.target.value),type,placeholder:'0',style:{width:'100%',padding:'10px 14px',border:'1px solid '+(hi?G:'#E2E8F0'),borderRadius:8,fontSize:14,boxSizing:'border-box',fontFamily:'inherit',background:hi?'#F0FFF4':'#fff'}})
)
const Se=(label,val,set,opts,tip)=>e('div',{style:{marginBottom:14}},
  e('div',{style:{display:'flex',alignItems:'center',marginBottom:5}},
    e('label',{style:{fontSize:12,fontWeight:700,color:SL}},label),
    tip&&e(Tip,{text:tip})
  ),
  e('select',{value:val,onChange:x=>set(x.target.value),style:{width:'100%',padding:'10px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,background:'#fff',fontFamily:'inherit'}},
    ...opts.map(([v,l])=>e('option',{key:v,value:v},l)))
)
const Ck=(label,val,set,tip)=>e('div',{style:{display:'flex',alignItems:'flex-start',gap:10,marginBottom:12}},
  e('input',{type:'checkbox',checked:val,onChange:x=>set(x.target.checked),style:{width:16,height:16,marginTop:2,accentColor:B,cursor:'pointer'}}),
  e('div',null,
    e('span',{style:{fontSize:13,color:N,cursor:'pointer',fontWeight:600},onClick:()=>set(!val)},label),
    tip&&e(Tip,{text:tip})
  )
)
const Divider=()=>e('div',{style:{height:1,background:'#F1F5F9',margin:'12px 0'}})
const SubHead=t=>e('div',{style:{fontSize:11,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:10,marginTop:6}},t)
const Rw=(l,v,c,bold,indent)=>e('div',{style:{display:'flex',justifyContent:'space-between',padding:'5px 0',paddingLeft:indent?16:0,borderBottom:'1px solid rgba(255,255,255,0.07)'}},
  e('span',{style:{fontSize:indent?12:13,color:indent?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.7)'}},l),
  e('span',{style:{fontSize:bold?14:12,fontWeight:bold?800:500,color:c||'#fff'}},v)
)
function calcTax(k1n,f){
  const fil=f.filing
  const isSE=['soleprop','smllc'].includes(f.entity)
  const isPass=['scorp','mmllc','partnership','soleprop','smllc'].includes(f.entity)
  const seBase=isSE?Math.max(0,k1n):0
  const seTax=seBase*0.9235*0.153,seDeduct=Math.round(seTax/2)
  const qbiCarryAmt=nv(f.qbiCarry)
  const qbi=isPass?Math.max(0,(k1n*0.20)-qbiCarryAmt):0
  const w2=nv(f.w2),interest=nv(f.interest),ordDiv=nv(f.ordDiv)
  const qualDiv=Math.min(nv(f.qualDiv),ordDiv)
  const stcg=nv(f.stcg),ltcg=nv(f.ltcg),rental=nv(f.rental)
  const nec=nv(f.nec),retirement=nv(f.retirement),otherInc=nv(f.otherInc)
  const ssBenefits=nv(f.ssBenefits)
  const comb=w2+k1n+interest+ordDiv+stcg+ltcg+rental+nec+(ssBenefits*0.5)
  const agi=comb+otherInc-seDeduct-nv(f.health)-nv(f.hsa)-nv(f.sep)-nv(f.sl)-nv(f.alimonyPaid)-retirement-nv(f.nolCarry)-nv(f.alimonyRcvd)
  const deps=parseInt(f.deps)||0
  const extraStd=(f.age65?1550:0)+(f.blind?1550:0)
  const stdDed=STD[fil]+extraStd+(fil==='mfj'?(f.age65?1550:0):0)
  const itemized=nv(f.mortgageInt)+Math.min(nv(f.propTax)+nv(f.stateIncomeTax),10000)+nv(f.charitable)+Math.max(0,nv(f.medical)-agi*0.075)
  const deduction=Math.max(stdDed,itemized)
  const taxableBeforeQbi=Math.max(0,agi-deduction)
  const qbiActual=isPass?Math.min(qbi,taxableBeforeQbi*0.20):0
  const taxableInc=Math.max(0,taxableBeforeQbi-qbiActual)
  const ordInc=Math.max(0,taxableInc-Math.max(0,qualDiv)-Math.max(0,ltcg))
  const ordTax=bTax(ordInc,fil)
  const capTax=ltcgTax(Math.max(0,ltcg+qualDiv),ordInc,fil)
  const childCr=Math.min(deps,3)*2000,childPhase=Math.max(0,Math.round((agi-200000)/1000))*50
  const childCrActual=Math.max(0,childCr-childPhase)
  const careCr=Math.min(nv(f.careExp),deps>1?6000:3000)*0.20
  const aocCr=Math.min(nv(f.aocExp)/1000,2.5)*1000
  const llcCr=Math.min(nv(f.llcExp),10000)*0.20
  const retCr=Math.min(nv(f.retContrib),2000)*(agi<36500?0.5:agi<39500?0.2:agi<66000?0.1:0)
  const credits=childCrActual+careCr+aocCr+llcCr+retCr
  const grossTax=Math.max(0,ordTax+capTax-credits)
  const netTax=Math.max(0,grossTax+seTax)
  const withheld=nv(f.w2Withheld)+nv(f.estPaid)
  const refundOrOwed=withheld-netTax
  const effRate=agi>0?(grossTax/agi)*100:0
  return{grossTax,netTax,seTax,seDeduct,qbi:qbiActual,agi,deduction,taxableInc,ordTax,capTax,credits,withheld,refundOrOwed,effRate,itemized,stdDed,isItemized:itemized>stdDed}
}
export default function TaxReturn(){
  const nav=useNavigate()
  const[k1,setK1]=React.useState(()=>localStorage.getItem('ts360_k1')||'0')
  const owns=localStorage.getItem('ts360_own')||'100'
  const[f,setF]=React.useState({
    filing:'single',deps:'0',age65:false,blind:false,entity:'scorp',
    w2:'',w2Withheld:'',
    interest:'',ordDiv:'',qualDiv:'',stcg:'',ltcg:'',rental:'',nec:'',ssBenefits:'',retirement:'',alimonyRcvd:'',otherInc:'',
    health:'',hsa:'',hsaFamily:false,sep:'',sl:'',alimonyPaid:'',
    nolCarry:'',qbiCarry:'',
    mortgageInt:'',propTax:'',stateIncomeTax:'',charitable:'',medical:'',
    careExp:'',aocExp:'',llcExp:'',retContrib:'',estPaid:''
  })
  const sf=(k,v)=>setF(p=>({...p,[k]:v}))
  const[res,setRes]=React.useState(null)
  const[wif,setWif]=React.useState({})
  const[wifRes,setWifRes]=React.useState(null)
  const[whatIfOpen,setWhatIfOpen]=React.useState(false)
  const[uploading,setUploading]=React.useState(false)
  const[uploadMsg,setUploadMsg]=React.useState('')
  const[savedRecords,setSavedRecords]=React.useState(()=>{try{return JSON.parse(localStorage.getItem('ts360_records')||'[]')}catch{return[]}})
  const[showSaveBox,setShowSaveBox]=React.useState(false)
  const[recordName,setRecordName]=React.useState('')
  const[compareMode,setCompareMode]=React.useState(false)
  const[selectedCompare,setSelectedCompare]=React.useState([])

  async function handlePaystubUpload(evt){
    const file=evt.target.files[0];if(!file)return
    setUploading(true);setUploadMsg('Reading paystub...')
    try{
      const toB64=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(f)})
      const b64=await toB64(file)
      const resp=await fetch('https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/paystub',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:[{type:'document',source:{type:'base64',media_type:'application/pdf',data:b64}},{type:'text',text:'Extract from this paystub. Return JSON only, no other text: {"ytd_gross_earnings":number,"ytd_federal_tax_withheld":number}. IMPORTANT: ytd_federal_tax_withheld is ONLY Federal Income Tax withheld YTD (labeled Fed Tax, Federal Tax, Federal Income Tax, or FIT). Do NOT include Social Security tax, Medicare tax, state tax, or any other deductions. Use 0 if not found.'}]}]})})
      const data=await resp.json()
      const txt=data.content[0].text.replace(/```json/g,'').replace(/```/g,'').trim()
      const parsed=JSON.parse(txt)
      sf('w2',String(Math.round(parsed.ytd_gross_earnings||0)))
      sf('w2Withheld',String(Math.round(parsed.ytd_federal_tax_withheld||0)))
      setUploadMsg('Read: Wages $'+Math.round(parsed.ytd_gross_earnings).toLocaleString()+' | Withheld $'+Math.round(parsed.ytd_federal_tax_withheld).toLocaleString())
    }catch(err){setUploadMsg('Could not read paystub - please enter figures manually.')}
    setUploading(false)
  }

  const calc=()=>{const r=calcTax(nv(k1),f);setRes(r);setWhatIfOpen(false);setWifRes(null)}

  function saveScenario(){
    if(!recordName.trim())return
    const scenario={id:Date.now(),name:recordName.trim(),k1,f,res,date:new Date().toLocaleDateString()}
    const updated=[scenario,...savedRecords].slice(0,5)
    setSavedRecords(updated)
    localStorage.setItem('ts360_records',JSON.stringify(updated))
    setRecordName('');setShowSaveBox(false)
  }
  function loadRecord(s){
    setK1(s.k1);setF(s.f);setRes(s.res);setWhatIfOpen(false);setCompareMode(false)
    window.scrollTo(0,0)
  }
  function deleteRecord(id){
    const updated=savedRecords.filter(s=>s.id!==id)
    setSavedRecords(updated)
    localStorage.setItem('ts360_records',JSON.stringify(updated))
    setSelectedCompare(prev=>prev.filter(i=>i!==id))
  }
  function toggleCompareSelect(id){
    setSelectedCompare(prev=>prev.includes(id)?prev.filter(i=>i!==id):[...prev,id].slice(0,5))
  }
  function runWhatIf(){
    const merged={...f,...wif}
    const wk1=wif.k1!==undefined?wif.k1:k1
    setWifRes(calcTax(nv(wk1),merged))
  }

  const stdAmt=STD[f.filing]||STD.single
  const filingLabels={single:'Single',mfj:'Married Filing Jointly',mfs:'Married Filing Separately',hoh:'Head of Household',qss:'Qualifying Surviving Spouse'}

  // scenarios to compare — either selected subset or all if none selected
  const compareScenarios=selectedCompare.length>0
    ?savedRecords.filter(s=>selectedCompare.includes(s.id))
    :savedRecords

  return e('div',{style:{minHeight:'100vh',background:'#F8FAFC',fontFamily:'system-ui,sans-serif',color:N}},
    e('nav',{style:{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 32px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:200}},
      e('div',{style:{display:'flex',alignItems:'center',gap:10}},
        e('span',{style:{fontSize:18,fontWeight:800,color:N}},'TaxStat',e('span',{style:{color:B}},'360')),
        e('span',{style:{fontSize:11,background:'#EFF6FF',color:B,padding:'3px 10px',borderRadius:20,fontWeight:700}},'Step 2 of 2 - Form 1040')
      ),
      e('div',{style:{display:'flex',gap:8}},
        e('button',{onClick:()=>nav('/calculate-tax'),style:{padding:'6px 14px',background:'none',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:SL,cursor:'pointer'}},'Back to P&L'),
        e('button',{onClick:()=>{localStorage.clear();nav('/')},style:{padding:'6px 14px',background:'none',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:SL,cursor:'pointer'}},'Sign Out')
      )
    ),
    e('div',{style:{maxWidth:1180,margin:'0 auto',padding:'28px 20px'}},
      e('h1',{style:{fontSize:24,fontWeight:800,color:N,textAlign:'center',marginBottom:2}},'Personal Tax Return - Form 1040'),
      e('p',{style:{textAlign:'center',color:SL,fontSize:13,marginBottom:20}},'Click each section to expand - '+TAX_YR+' Tax Year - All IRS limits applied automatically'),

      // K-1 header bar
      e('div',{style:{background:'linear-gradient(135deg,#0D1B3E,#1e3a70)',borderRadius:12,padding:'16px 22px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between'}},
        e('div',null,
          e('div',{style:{fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:3}},'K-1 PASS-THROUGH INCOME - FROM STEP 1'),
          e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.6)'}},owns+'% ownership - Schedule E')
        ),
        e('div',{style:{textAlign:'right'}},
          e('div',{style:{fontSize:32,fontWeight:800,color:nv(k1)>=0?'#4ADE80':'#F87171'}},'$'+Math.abs(Math.round(nv(k1))||0).toLocaleString()),
          e('button',{onClick:()=>nav('/calculate-tax'),style:{fontSize:11,color:'rgba(255,255,255,0.4)',background:'none',border:'none',cursor:'pointer',marginTop:3,display:'block'}},'Edit business P&L')
        )
      ),

      e('div',{style:{display:'grid',gridTemplateColumns:'1fr 420px',gap:20,alignItems:'start'}},

        // ---- LEFT: FORM SECTIONS ----
        e('div',null,
          e(Section,{title:'Filing Status & Personal Info',icon:'1',open:true},
            Se('Filing Status',f.filing,v=>sf('filing',v),[
              ['single','Single'],['mfj','Married Filing Jointly'],['mfs','Married Filing Separately'],
              ['hoh','Head of Household'],['qss','Qualifying Surviving Spouse']
            ]),
            Se('Business Entity Type',f.entity,v=>sf('entity',v),[
              ['scorp','S-Corporation'],['mmllc','Multi-Member LLC'],['partnership','Partnership'],
              ['soleprop','Sole Proprietor'],['smllc','Single-Member LLC'],['ccorp','C-Corporation']
            ],
            'Determines SE tax, QBI deduction, and K-1 treatment'),
            e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
              Fi('Number of Dependents',f.deps,v=>sf('deps',v)),
              Fi('W-2 Wages (if applicable)',f.w2,v=>sf('w2',v),undefined,!!f.w2)
            ),
            e('div',{style:{display:'flex',gap:20}},
              Ck('Age 65 or older',f.age65,v=>sf('age65',v)),
              Ck('Legally blind',f.blind,v=>sf('blind',v))
            ),
            e('div',{style:{background:'#F8FAFC',borderRadius:10,padding:14,border:'1px solid #E2E8F0',marginTop:8}},
              e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:uploadMsg?8:0}},
                e('div',null,
                  e('div',{style:{fontSize:12,fontWeight:700,color:N,marginBottom:2}},'\uD83D\uDCCB Upload Paystub PDF'),
                  e('div',{style:{fontSize:11,color:SL}},'Auto-fills W-2 wages & withholding via AI')
                ),
                e('label',{style:{padding:'7px 16px',background:uploading?SL:B,border:'none',borderRadius:7,fontSize:12,fontWeight:700,color:'#fff',cursor:uploading?'default':'pointer'}},
                  uploading?'Reading...':'Upload PDF',
                  e('input',{type:'file',accept:'.pdf',onChange:handlePaystubUpload,style:{display:'none'},disabled:uploading})
                )
              ),
              uploadMsg&&e('div',{style:{fontSize:12,color:G,fontWeight:600,marginTop:6}},'\u2713 '+uploadMsg)
            )
          ),

          e(Section,{title:'W-2 Withholding',icon:'2'},
            Fi('Federal Tax Withheld (W-2 Box 2)',f.w2Withheld,v=>sf('w2Withheld',v),undefined,!!f.w2Withheld),
            Fi('Estimated Tax Payments Made',f.estPaid,v=>sf('estPaid',v))
          ),

          e(Section,{title:'Investment & Other Income',icon:'3'},
            SubHead('INTEREST & DIVIDENDS'),
            e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
              Fi('Taxable Interest',f.interest,v=>sf('interest',v)),
              Fi('Ordinary Dividends',f.ordDiv,v=>sf('ordDiv',v)),
              Fi('Qualified Dividends',f.qualDiv,v=>sf('qualDiv',v),undefined,false),
              Fi('NEC / 1099 Income',f.nec,v=>sf('nec',v))
            ),
            Divider(),
            SubHead('CAPITAL GAINS'),
            e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
              Fi('Short-Term Capital Gains',f.stcg,v=>sf('stcg',v)),
              Fi('Long-Term Capital Gains',f.ltcg,v=>sf('ltcg',v))
            ),
            Divider(),
            SubHead('OTHER INCOME'),
            e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
              Fi('Rental Income (net)',f.rental,v=>sf('rental',v)),
              Fi('Social Security Benefits',f.ssBenefits,v=>sf('ssBenefits',v)),
              Fi('Alimony Received (pre-2019)',f.alimonyRcvd,v=>sf('alimonyRcvd',v)),
              Fi('Other Income',f.otherInc,v=>sf('otherInc',v))
            )
          ),

          e(Section,{title:'Above-the-Line Deductions',icon:'4'},
            e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
              Fi('Self-Employed Health Insurance',f.health,v=>sf('health',v),undefined,false),
              Fi('HSA Contribution',f.hsa,v=>sf('hsa',v)),
              Fi('SEP-IRA / Solo 401k Contribution',f.sep,v=>sf('sep',v)),
              Fi('Student Loan Interest',f.sl,v=>sf('sl',v)),
              Fi('IRA / Retirement Contribution',f.retirement,v=>sf('retirement',v)),
              Fi('Alimony Paid (pre-2019)',f.alimonyPaid,v=>sf('alimonyPaid',v)),
              Fi('NOL Carryforward',f.nolCarry,v=>sf('nolCarry',v)),
              Fi('Prior-Year QBI Carryforward',f.qbiCarry,v=>sf('qbiCarry',v))
            )
          ),

          e(Section,{title:'Itemized Deductions',icon:'5'},
            e('div',{style:{background:'#EFF6FF',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:12,color:B}},'Standard Deduction for '+filingLabels[f.filing]+': '+fmt(stdAmt)+' (auto-applied if larger)'),
            e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
              Fi('Mortgage Interest',f.mortgageInt,v=>sf('mortgageInt',v)),
              Fi('Property Tax',f.propTax,v=>sf('propTax',v)),
              Fi('State Income Tax',f.stateIncomeTax,v=>sf('stateIncomeTax',v)),
              Fi('Charitable Contributions',f.charitable,v=>sf('charitable',v)),
              Fi('Medical Expenses (total)',f.medical,v=>sf('medical',v))
            )
          ),

          e(Section,{title:'Tax Credits',icon:'6'},
            e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
              Fi('Child & Dependent Care Expenses',f.careExp,v=>sf('careExp',v)),
              Fi('American Opportunity Credit (tuition)',f.aocExp,v=>sf('aocExp',v)),
              Fi('Lifetime Learning Credit (tuition)',f.llcExp,v=>sf('llcExp',v)),
              Fi('Retirement Savings Contrib.',f.retContrib,v=>sf('retContrib',v))
            )
          ),

          e('div',{style:{textAlign:'center',marginTop:4,marginBottom:24}},
            e('button',{onClick:calc,style:{padding:'14px 48px',background:B,border:'none',borderRadius:12,fontSize:16,fontWeight:800,color:'#fff',cursor:'pointer',boxShadow:'0 4px 20px rgba(37,99,235,0.35)'}},
              'Calculate My Tax \u2192'
            )
          )
        ),

        // ---- RIGHT: RESULTS PANEL ----
        e('div',null,

          // -- SAVE SCENARIO (shown after calc) --
          res&&e('div',{style:{background:'#fff',borderRadius:14,padding:20,border:'1px solid #E2E8F0',marginBottom:16}},
            e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:showSaveBox?14:0}},
              e('div',{style:{fontSize:13,fontWeight:700,color:N}},'\uD83D\uDCBE Save Scenario'),
              e('button',{onClick:()=>setShowSaveBox(!showSaveBox),style:{padding:'5px 14px',background:showSaveBox?'none':B,border:'1px solid '+(showSaveBox?'#E2E8F0':B),borderRadius:7,fontSize:12,fontWeight:700,color:showSaveBox?SL:'#fff',cursor:'pointer'}},
                showSaveBox?'Cancel':'Save This Scenario'
              )
            ),
            showSaveBox&&e('div',null,
              e('div',{style:{fontSize:12,color:SL,marginBottom:8}},'Name this scenario to compare it later (up to 5 saved)'),
              e('div',{style:{display:'flex',gap:8}},
                e('input',{value:recordName,onChange:x=>setRecordName(x.target.value),placeholder:'e.g. "Max Deductions" or "Current"',onKeyDown:x=>x.key==='Enter'&&saveScenario(),style:{flex:1,padding:'9px 12px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,fontFamily:'inherit'}}),
                e('button',{onClick:saveScenario,style:{padding:'9px 16px',background:G,border:'none',borderRadius:7,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit'}},'Save')
              )
            )
          ),

          // -- SAVED SCENARIOS --
          savedRecords.length>0&&e('div',{style:{background:'#fff',borderRadius:14,padding:20,border:'1px solid #E2E8F0',marginBottom:16}},
            e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}},
              e('div',{style:{fontSize:13,fontWeight:700,color:N}},'\uD83D\uDCC1 Saved Scenarios ('+savedRecords.length+')'),
              e('button',{
                onClick:()=>setCompareMode(!compareMode),
                style:{padding:'5px 14px',background:compareMode?B:'none',border:'1px solid '+(compareMode?B:'#E2E8F0'),borderRadius:7,fontSize:12,fontWeight:700,color:compareMode?'#fff':SL,cursor:'pointer'}
              },compareMode?'\u2716 Close Compare':'\uD83D\uDCCA Compare Side-by-Side')
            ),
            compareMode&&e('div',{style:{fontSize:11,color:SL,marginBottom:10}},'Select up to 5 scenarios to compare, or leave all selected for full comparison'),
            e('div',{style:{display:'flex',flexDirection:'column',gap:6}},
              ...savedRecords.map(s=>
                e('div',{key:s.id,style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:compareMode&&selectedCompare.includes(s.id)?'#EFF6FF':'#F8FAFC',borderRadius:9,border:'1px solid '+(compareMode&&selectedCompare.includes(s.id)?B:'#E2E8F0')}},
                  e('div',{style:{display:'flex',alignItems:'center',gap:8}},
                    compareMode&&e('input',{type:'checkbox',checked:selectedCompare.includes(s.id),onChange:()=>toggleCompareSelect(s.id),style:{accentColor:B,cursor:'pointer'}}),
                    e('div',null,
                      e('div',{style:{fontSize:13,fontWeight:700,color:N}},s.name),
                      e('div',{style:{fontSize:11,color:SL}},s.date+' \u00b7 Tax: '+(s.res?fmt(s.res.grossTax):'—'))
                    )
                  ),
                  !compareMode&&e('div',{style:{display:'flex',gap:6}},
                    e('button',{onClick:()=>loadRecord(s),style:{padding:'5px 12px',background:B,border:'none',borderRadius:6,fontSize:12,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit'}},'Load'),
                    e('button',{onClick:()=>deleteRecord(s.id),style:{padding:'5px 10px',background:'none',border:'1px solid #FECACA',borderRadius:6,fontSize:12,color:R,cursor:'pointer',fontFamily:'inherit'}},'\u2715')
                  )
                )
              )
            )
          ),

          // -- SIDE-BY-SIDE COMPARE TABLE --
          compareMode&&compareScenarios.length>0&&e('div',{style:{background:'#fff',borderRadius:14,padding:20,border:'1px solid #E2E8F0',marginBottom:16,overflowX:'auto'}},
            e('div',{style:{fontSize:13,fontWeight:700,color:N,marginBottom:14}},'\uD83D\uDCCA Scenario Comparison'),
            e('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
              e('thead',null,
                e('tr',null,
                  e('th',{style:{textAlign:'left',padding:'8px 10px',color:SL,fontWeight:700,fontSize:11,borderBottom:'2px solid #E2E8F0'}},'Metric'),
                  ...compareScenarios.map(s=>
                    e('th',{key:s.id,style:{textAlign:'right',padding:'8px 10px',color:N,fontWeight:800,fontSize:12,borderBottom:'2px solid '+B,borderLeft:'1px solid #E2E8F0',maxWidth:100,wordBreak:'break-word'}},s.name)
                  )
                )
              ),
              e('tbody',null,
                ...[
                  ['K-1 Income',s=>fmt(nv(s.k1)),''],
                  ['AGI',s=>s.res?fmt(s.res.agi):'—',''],
                  ['Taxable Income',s=>s.res?fmt(s.res.taxableInc):'—',''],
                  ['QBI Deduction',s=>s.res?fmt(s.res.qbi):'—',G],
                  ['SE Tax',s=>s.res?fmt(s.res.seTax):'—',R],
                  ['Credits Applied',s=>s.res?fmt(s.res.credits):'—',G],
                  ['Total Tax Liability',s=>s.res?fmt(s.res.grossTax):'—',R,true],
                  ['Effective Rate',s=>s.res?pct(s.res.effRate):'—',''],
                  ['Refund / Owed',s=>s.res?(s.res.refundOrOwed>=0?'\u2713 '+fmt(s.res.refundOrOwed):'\u25B2 '+fmt(Math.abs(s.res.refundOrOwed))):'—',s=>s.res?(s.res.refundOrOwed>=0?G:R):'']
                ].map(([label,valFn,colorFn,bold])=>
                  e('tr',{key:label,style:{borderBottom:'1px solid #F1F5F9'}},
                    e('td',{style:{padding:'8px 10px',color:SL,fontWeight:600}},label),
                    ...compareScenarios.map(s=>{
                      const color=typeof colorFn==='function'?colorFn(s):colorFn
                      return e('td',{key:s.id,style:{textAlign:'right',padding:'8px 10px',fontWeight:bold?800:500,color:color||N,borderLeft:'1px solid #F1F5F9'}},valFn(s))
                    })
                  )
                )
              )
            )
          ),

          // -- WHAT-IF SIMULATOR --
          res&&e('div',{style:{background:'#fff',borderRadius:14,padding:20,border:'1px solid #E2E8F0',marginBottom:16}},
            e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:whatIfOpen?14:0}},
              e('div',{style:{fontSize:13,fontWeight:700,color:N}},'\uD83C\uDFAF What-If Simulator'),
              e('button',{onClick:()=>{setWhatIfOpen(!whatIfOpen);if(whatIfOpen){setWifRes(null);setWif({})}},style:{padding:'5px 14px',background:whatIfOpen?'none':B,border:'1px solid '+(whatIfOpen?'#E2E8F0':B),borderRadius:7,fontSize:12,fontWeight:700,color:whatIfOpen?SL:'#fff',cursor:'pointer'}},
                whatIfOpen?'Close':'Try a Scenario'
              )
            ),
            whatIfOpen&&e('div',null,
              e('div',{style:{fontSize:12,color:SL,marginBottom:12}},'Override any value to see how it changes your tax — your real numbers are unchanged'),
              e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}},
                Fi('K-1 Income Override',wif.k1||'',v=>setWif(p=>({...p,k1:v}))),
                Fi('W-2 Override',wif.w2||'',v=>setWif(p=>({...p,w2:v}))),
                Fi('Extra Deduction',wif.extraDed||'',v=>setWif(p=>({...p,extraDed:v}))),
                Fi('Retirement Contrib.',wif.retirement||'',v=>setWif(p=>({...p,retirement:v})))
              ),
              e('button',{onClick:runWhatIf,style:{width:'100%',padding:'10px',background:B,border:'none',borderRadius:8,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer'}},'Run What-If'),
              wifRes&&e('div',{style:{marginTop:14}},
                e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}},
                  e('div',{style:{background:'rgba(37,99,235,0.1)',borderRadius:8,padding:'10px 12px',textAlign:'center'}},
                    e('div',{style:{fontSize:10,color:SL,marginBottom:3}},'CURRENT'),
                    e('div',{style:{fontSize:20,fontWeight:800,color:N}},fmt(res.grossTax))
                  ),
                  e('div',{style:{background:'rgba(74,222,128,0.15)',borderRadius:8,padding:'10px 12px',textAlign:'center'}},
                    e('div',{style:{fontSize:10,color:SL,marginBottom:3}},'WHAT-IF'),
                    e('div',{style:{fontSize:20,fontWeight:800,color:'#4ADE80'}},fmt(wifRes.grossTax))
                  )
                ),
                res.grossTax-wifRes.grossTax>0
                  ?e('div',{style:{background:'rgba(74,222,128,0.15)',border:'1px solid rgba(74,222,128,0.3)',borderRadius:8,padding:'10px 14px',textAlign:'center'}},
                    e('div',{style:{fontSize:12,color:G,fontWeight:700}},'You would SAVE '+fmt(res.grossTax-wifRes.grossTax)+' in taxes')
                  )
                  :e('div',{style:{background:'rgba(248,113,113,0.15)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:8,padding:'10px 14px',textAlign:'center'}},
                    e('div',{style:{fontSize:12,color:R,fontWeight:700}},'Tax increases by '+fmt(wifRes.grossTax-res.grossTax))
                  )
              )
            )
          ),

          // -- TAX SUMMARY CARD --
          res?e('div',{style:{background:'linear-gradient(160deg,#0D1B3E 0%,#1e3a70 100%)',borderRadius:14,padding:24,color:'#fff',position:'sticky',top:70}},
            e('div',{style:{fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:4,letterSpacing:'0.5px'}},'TAX YEAR '+TAX_YR+' SUMMARY'),
            e('div',{style:{fontSize:44,fontWeight:800,color:res.grossTax>0?'#F87171':'#4ADE80',marginBottom:4}},fmt(res.grossTax)),
            e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.5)',marginBottom:16}},'Effective Rate: '+pct(res.effRate)+' of AGI'),
            Rw('Adjusted Gross Income',fmt(res.agi)),
            Rw(res.isItemized?'Itemized Deduction':'Standard Deduction',fmt(res.deduction)),
            res.qbi>0&&Rw('QBI Deduction (20%)',fmt(res.qbi),G),
            Rw('Taxable Income',fmt(res.taxableInc)),
            Divider(),
            SubHead('TAX BREAKDOWN'),
            Rw('Ordinary Income Tax',fmt(res.ordTax)),
            res.capTax>0&&Rw('Capital Gains Tax',fmt(res.capTax)),
            res.seTax>0&&Rw('Self-Employment Tax',fmt(res.seTax)),
            res.credits>0&&Rw('Credits Applied','-'+fmt(res.credits),'#4ADE80'),
            e('div',{style:{height:1,background:'rgba(255,255,255,0.15)',margin:'10px 0'}}),
            Rw('Total Tax Liability',fmt(res.grossTax),null,true),
            Rw('Already Withheld / Paid',fmt(res.withheld)),
            e('div',{style:{marginTop:14,padding:'14px',borderRadius:10,background:res.refundOrOwed>=0?'rgba(74,222,128,0.15)':'rgba(248,113,113,0.15)',border:'1px solid '+(res.refundOrOwed>=0?'rgba(74,222,128,0.3)':'rgba(248,113,113,0.3)'),textAlign:'center'}},
              e('div',{style:{fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:4}},res.refundOrOwed>=0?'ESTIMATED REFUND':'ESTIMATED AMOUNT OWED'),
              e('div',{style:{fontSize:28,fontWeight:800,color:res.refundOrOwed>=0?'#4ADE80':'#F87171'}},fmt(Math.abs(res.refundOrOwed)))
            ),
            e('button',{onClick:()=>nav('/ai-analysis'),style:{width:'100%',marginTop:16,padding:'12px',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:10,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}},
              '\uD83E\uDD16 Get AI Tax Strategy Analysis \u2192'
            )
          ):e('div',{style:{background:'#fff',borderRadius:14,padding:32,border:'1px solid #E2E8F0',textAlign:'center'}},
            e('div',{style:{fontSize:44,marginBottom:12}},'[1040]'),
            e('div',{style:{fontSize:15,fontWeight:700,color:N,marginBottom:8}},'Your tax summary appears here'),
            e('div',{style:{fontSize:13,color:SL,lineHeight:1.8}},'Expand any section on the left, fill in your details, then click Calculate')
          )
        )
      )
    )
  )
}
