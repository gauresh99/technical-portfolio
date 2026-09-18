export type DocEntry = {
  label: string;
  fileName: string;
  expiry: string;
  uri?: string;
  mimeType?: string;
  docType?: string;
};

export type Product = {
  id:string; name:string; brand:string; status:'Active'|'Expiring soon'|'Expired'; expires:string; warrantyStart:string; warrantyEnd:string; dateAdded:string; type:string;
  ownerId?: string;
  category?: string;
  personal?: boolean;
  keywords:string[];
  reminders?: string[];
  serialNumber?: string;
  seller?: string;
  docs:string[];
  docEntries?: DocEntry[];
  support:{site:string; phone:string; method:string}; extended?:{plan:string; provider:string; expires:string};
  coverage:{included:string[]; excluded:string[]}; steps:string[];
  groupId?: string;
  mergedToMain?: boolean;
};

export type ProductCategory = {
  id: string;
  name: string;
  productIds: string[];
  createdAt: string;
};
export const mockProducts: Product[] = [
 {id:'macbook',name:'MacBook Pro 14”',brand:'Apple',status:'Active',expires:'Dec 18, 2026',warrantyStart:'2024-12-18',warrantyEnd:'2026-12-18',dateAdded:'Jun 12, 2026',type:'Invoice + AppleCare+',keywords:['laptop','computer','notebook','mac','macbook'],docs:['Invoice_Apple.pdf','AppleCare_Cert.pdf'],support:{site:'apple.com/support',phone:'1800-419-5046',method:'Via support portal'},extended:{plan:'AppleCare+',provider:'Apple Inc.',expires:'Dec 18, 2027'},coverage:{included:['Hardware defects','Battery replacement','Accidental damage','Logic board failure'],excluded:['Theft or loss','Cosmetic damage','Unauthorised modifications']},steps:['Visit apple.com/support or call 1800-419-5046','Sign in with Apple ID linked to your device','Select your MacBook and choose Get support','Apple will arrange repair, replacement or mail-in']},
 {id:'sony',name:'Sony WH-1000XM5',brand:'Sony',status:'Expiring soon',expires:'Jul 22, 2026',warrantyStart:'2025-07-22',warrantyEnd:'2026-07-22',dateAdded:'Jun 03, 2026',type:'Invoice',keywords:['headphone','headphones','earphones','audio','bluetooth','noise cancelling'],docs:['Sony_Invoice.pdf'],support:{site:'sony.co.in/support',phone:'1800-103-7799',method:'Service center'},coverage:{included:['Manufacturing defects','Audio driver issues','Charging defects'],excluded:['Water damage','Physical damage']},steps:['Open Sony support','Enter model/serial number','Book repair or visit service center']},
 {id:'lg-ac',name:'LG 1.5T Split AC',brand:'LG',status:'Active',expires:'May 10, 2028',warrantyStart:'2023-05-10',warrantyEnd:'2028-05-10',dateAdded:'May 28, 2026',type:'Invoice',keywords:['ac','air conditioner','air conditioning','cooling','appliance'],docs:['LG_AC_Invoice.pdf'],support:{site:'lg.com/in/support',phone:'1800-315-9999',method:'Service request'},coverage:{included:['Compressor warranty','PCB defects','Cooling faults'],excluded:['Gas refill due to leakage','Improper installation']},steps:['Open LG support','Raise service request','Keep invoice ready']},
 {id:'portronics',name:'Portronics Mport 52',brand:'Portronics',status:'Active',expires:'Jun 24, 2027',warrantyStart:'2025-06-24',warrantyEnd:'2027-06-24',dateAdded:'May 18, 2026',type:'Registered warranty',keywords:['hub','adapter','dock','usb','type c','accessory'],docs:['Portronics_Mport52.pdf'],support:{site:'portronics.com/support',phone:'9555-245-245',method:'Warranty claim form'},coverage:{included:['Manufacturing defects','Port failure'],excluded:['Cable damage','Burn damage']},steps:['Visit Portronics support','Enter registered phone/email','Submit invoice and product photos']},
 {id:'samsung-tv',name:'Samsung 65” QLED TV',brand:'Samsung',status:'Active',expires:'Mar 14, 2027',warrantyStart:'2025-03-14',warrantyEnd:'2027-03-14',dateAdded:'Apr 30, 2026',type:'Invoice',keywords:['tv','television','display','screen','qled'],docs:['Samsung_TV_Invoice.pdf'],support:{site:'samsung.com/in/support',phone:'1800-572-6786',method:'Home service'},coverage:{included:['Panel defects','Motherboard defects'],excluded:['Screen breakage','Power surge damage']},steps:['Open Samsung support','Book home service','Share invoice and serial number']},
 {id:'dyson',name:'Dyson V12 Detect Slim',brand:'Dyson',status:'Expiring soon',expires:'Aug 08, 2026',warrantyStart:'2024-08-08',warrantyEnd:'2026-08-08',dateAdded:'Mar 11, 2026',type:'Invoice',keywords:['vacuum','cleaner','home appliance','cordless','cleaning'],docs:['Dyson_V12_Invoice.pdf'],support:{site:'dyson.in/support',phone:'1800-258-6688',method:'Support booking'},coverage:{included:['Motor defects','Battery faults','Charger issues'],excluded:['Filter wear','Physical damage']},steps:['Open Dyson support','Choose vacuum support','Upload invoice and serial number']},
 {id:'kindle',name:'Kindle Paperwhite',brand:'Amazon',status:'Expired',expires:'Feb 03, 2026',warrantyStart:'2025-02-03',warrantyEnd:'2026-02-03',dateAdded:'Feb 09, 2026',type:'Invoice',keywords:['reader','ebook','e-reader','tablet','book'],docs:['Kindle_Invoice.pdf'],support:{site:'amazon.in/help',phone:'1800-3000-9009',method:'Amazon support'},coverage:{included:['Manufacturing defects','Display faults'],excluded:['Water damage','Accidental drops']},steps:['Open Amazon support','Select Kindle device','Check paid repair or replacement options']},
 {
   id:'swift-dzire',
   name:'Maruti Swift Dzire',
   brand:'Maruti Suzuki',
   status:'Expiring soon',
   expires:'Jul 10, 2026',
   warrantyStart:'2022-06-10',
   warrantyEnd:'2026-07-10',
   dateAdded:'Jun 17, 2026',
   type:'Multiple documents',
   category:'Car',
   keywords:['car','vehicle','automobile','maruti','suzuki','swift','dzire'],
   serialNumber:'MH02CK4521',
   docs:['Swift_Warranty.pdf','Insurance_Policy.pdf','PUC_Certificate.pdf','RC_Document.pdf','Extended_Warranty.pdf'],
   docEntries:[
     { label:'Manufacturer warranty',      fileName:'Swift_Warranty.pdf',      expiry:'2027-06-10' },
     { label:'Car insurance',              fileName:'Insurance_Policy.pdf',    expiry:'2026-08-20' },
     { label:'PUC / Emission certificate', fileName:'PUC_Certificate.pdf',     expiry:'2026-07-10' },
     { label:'RC / Registration',          fileName:'RC_Document.pdf',         expiry:'2030-05-15' },
     { label:'Extended warranty',          fileName:'Extended_Warranty.pdf',   expiry:'2029-06-10' },
   ],
   support:{site:'marutisuzuki.com/pages/services',phone:'1800-102-1800',method:'Authorised service centre'},
   coverage:{
     included:['Engine & transmission defects','Electrical system faults','Manufacturer defects (all parts)'],
     excluded:['Accidental damage','Wear & tear (brakes, tyres, filters)','Damage from modifications'],
   },
   steps:['Contact nearest Maruti authorised service centre','Carry all original documents (RC, insurance, warranty card)','Lodge complaint — get a job card number','Collect vehicle after repair with updated service record'],
 },
 // KubeAir company assets
 {id:'dell-server',name:'Dell PowerEdge R740',brand:'Dell',status:'Active',expires:'Jan 15, 2029',warrantyStart:'2026-01-15',warrantyEnd:'2029-01-15',dateAdded:'Jan 15, 2026',type:'ProSupport',keywords:['server','rack','dell','poweredge','computing'],docs:['Dell_ProSupport_R740.pdf'],support:{site:'dell.com/support',phone:'1800-425-0088',method:'ProSupport on-site'},coverage:{included:['Hardware failure','Next-business-day on-site','Remote diagnosis'],excluded:['Accidental damage','Software issues']},steps:['Log ticket at dell.com/support','Provide Service Tag','Technician dispatched within 1 business day'],groupId:'kubeair-company'},
 {id:'hp-printer',name:'HP LaserJet Pro M404dn',brand:'HP',status:'Active',expires:'Mar 20, 2028',warrantyStart:'2026-03-20',warrantyEnd:'2028-03-20',dateAdded:'Mar 20, 2026',type:'Invoice',keywords:['printer','laser','hp','laserjet','office'],docs:['HP_LaserJet_Invoice.pdf'],support:{site:'support.hp.com',phone:'1800-108-4747',method:'HP support portal'},coverage:{included:['Hardware defects','Print-quality issues','Paper-feed faults'],excluded:['Toner/ink cartridges','Physical damage']},steps:['Visit support.hp.com','Enter serial number','Request on-site or mail-in service'],groupId:'kubeair-company'},
 {id:'cisco-switch',name:'Cisco Catalyst 2960-X',brand:'Cisco',status:'Active',expires:'May 05, 2031',warrantyStart:'2026-05-05',warrantyEnd:'2031-05-05',dateAdded:'May 05, 2026',type:'SmartNet',keywords:['switch','network','cisco','catalyst','networking'],docs:['Cisco_SmartNet_Contract.pdf'],support:{site:'cisco.com/go/support',phone:'1800-103-1755',method:'SmartNet TAC'},coverage:{included:['Hardware replacement','24x7 TAC access','Software updates'],excluded:['Physical damage','Deliberate misuse']},steps:['Open TAC case at cisco.com/go/support','Provide contract number and serial','RMA or on-site arranged per contract'],groupId:'kubeair-company'},
 {id:'office-ac',name:'Daikin 2T Office Cassette AC',brand:'Daikin',status:'Active',expires:'Feb 10, 2031',warrantyStart:'2026-02-10',warrantyEnd:'2031-02-10',dateAdded:'Feb 10, 2026',type:'Invoice + Extended',keywords:['ac','air conditioner','daikin','cassette','office cooling'],docs:['Daikin_Office_AC_Invoice.pdf'],support:{site:'daikinindia.com',phone:'1800-102-9300',method:'Service request portal'},coverage:{included:['Compressor 5yr','PCB defects','Cooling faults'],excluded:['Gas refill','Improper installation']},steps:['Log request at daikinindia.com','Technician visits within 48 hours','Keep invoice and installation report'],groupId:'kubeair-company'},
 {id:'epson-projector',name:'Epson EB-X49 Projector',brand:'Epson',status:'Expiring soon',expires:'Aug 01, 2026',warrantyStart:'2024-08-01',warrantyEnd:'2026-08-01',dateAdded:'Aug 01, 2024',type:'Invoice',keywords:['projector','epson','display','presentation','conference'],docs:['Epson_EB-X49_Invoice.pdf'],support:{site:'epson.co.in/support',phone:'1800-103-6660',method:'Carry-in or on-site'},coverage:{included:['Lamp defects (90 days)','Hardware faults'],excluded:['Lamp after 90 days','Burn-in from static images']},steps:['Visit epson.co.in/support','Enter serial number','Drop off at service centre or request on-site visit'],groupId:'kubeair-company'},
];

export function matchesProductSearch(product: Product, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const fields = [product.name, product.brand, product.type, product.status, ...product.keywords]
    .map((v) => v.toLowerCase());

  // Word-boundary check: does any word in any field start with `term`?
  const wordStartMatch = (term: string) =>
    fields.some((f) => f === term || f.startsWith(term + ' ') || f.includes(' ' + term));

  // Full substring check (used for longer terms only)
  const substringMatch = (term: string) =>
    fields.some((f) => f.includes(term));

  const matchTerm = (term: string) =>
    term.length <= 2 ? wordStartMatch(term) : substringMatch(term);

  // Multi-word: every word must match
  const words = q.split(/\s+/).filter(Boolean);
  return words.every(matchTerm);
}
