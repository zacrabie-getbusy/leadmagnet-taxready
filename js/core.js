// ─── SEGMENT DATA ─────────────────────────────────────────────────────────
const SEGMENTS = {

  employed: {
    label: 'Employed (PAYE)',
    eyebrow: 'For employed workers (PAYE)',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">and the right local accountant to handle it.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '32,000',
    incomeHint: 'Your gross annual salary — approximate is fine',
    tiers: [
      { name:'Light', desc:'Few expenses claimed', totalDeduction:2000, pensionAmount:1300, tags:['🏠 WFH (flat rate)','📚 Professional subs','🚗 Mileage (low)','💰 Pension (3–4%)'] },
      { name:'Typical', desc:'Common claims included', totalDeduction:3800, pensionAmount:2000, tags:['🏠 WFH (full year)','🚗 Mileage','📚 Subs & training','👔 Uniforms','💰 Pension (5%)'] },
      { name:'Full', desc:'All typical deductions', totalDeduction:6200, pensionAmount:3200, tags:['🏠 WFH','🚗 Mileage','📚 Training & CPD','👔 Uniforms & tools','💰 Pension (8%)'] },
    ],
    notesPH: 'e.g. I have a company car, or I also do some freelance work on the side',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my UK tax in 30 seconds on TaxReady — free, no sign-up. 5.6 million UK workers overpaid HMRC in 2023/24. Worth a look:\n\nhttps://taxready.app",
    shareUrl: 'https://taxready.app',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'PAYE & tax rebates' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'Employee tax specialist' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'PAYE & benefits' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Tax rebate specialist' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'}]
  },

  construction: {
    label: 'Construction & Trades',
    eyebrow: 'For construction & trades',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">built for construction & trades.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '38,000',
    incomeHint: 'Total earnings this year — check your invoices or bank statements',
    tiers: [
      { name:'Light', desc:'Basic running costs', totalDeduction:4000, pensionAmount:0, tags:['🚐 Van & fuel (basic)','🔧 Hand tools','🦺 PPE & workwear','📱 Phone & admin'] },
      { name:'Typical', desc:'Common trade expenses', totalDeduction:9100, pensionAmount:1600, tags:['🚐 Van & fuel','🔧 Tools & equipment','🦺 PPE & workwear','🏠 Home office','🛡 Insurance','💰 Pension (SIPP)'] },
      { name:'Full', desc:'All typical deductions', totalDeduction:14500, pensionAmount:2500, tags:['🚐 Van & fuel (full)','🔧 Full toolkit','🦺 PPE','🏠 Home office','🛡 Insurance','👷 Subcontract work','💰 Pension (SIPP)'] },
    ],
    notesPH: 'e.g. I use my van every day, have CIS deductions, subcontract some work',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my 2025/26 tax as a UK tradesperson — free, 30 seconds, no sign-up. 5.6m UK workers overpaid HMRC in 2023/24 — average of £625 among those affected. If you're in construction or trades, worth a look:\n\nhttps://taxready.app/construction",
    shareUrl: 'https://taxready.app/construction',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'Construction & CIS' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'CIS & subcontractors' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'Sole trader specialist' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Construction & trades' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'},{l:'32%',t:'52%'},{l:'60%',t:'68%'},{l:'48%',t:'80%'},{l:'75%',t:'48%'},{l:'20%',t:'68%'},{l:'50%',t:'24%'}]
  },

  freelancer: {
    label: 'Freelancers & Contractors',
    eyebrow: 'For freelancers & contractors',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">built for freelancers & contractors.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '65,000',
    incomeHint: 'Total fees invoiced this tax year — approximate is fine',
    tiers: [
      { name:'Light', desc:'Basic freelance costs', totalDeduction:5500, pensionAmount:2000, tags:['💻 Equipment','📱 Phone & internet','🏠 Home office','🛡 Insurance','💰 Pension (SIPP)'] },
      { name:'Typical', desc:'Common freelancer claims', totalDeduction:11000, pensionAmount:3500, tags:['💻 Equipment & tech','📱 Phone','🏠 Home office','🚂 Travel','📚 Training','🛡 Insurance','💰 Pension (SIPP)'] },
      { name:'Full', desc:'All typical deductions', totalDeduction:18500, pensionAmount:5500, tags:['💻 Full tech setup','📱 Phone','🏠 Home office','🚂 Business travel','📚 Training & CPD','🛡 Indemnity cover','💼 Accountancy','💰 Pension (SIPP, higher)'] },
    ],
    notesPH: 'e.g. I work via a limited company, have multiple clients, concerned about IR35',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my 2025/26 freelance tax — free, 30 seconds, no sign-up. Most freelancers miss £1,000+ in allowable expenses. 5.6m UK workers overpaid HMRC in 2023/24. Worth a check:\n\nhttps://taxready.app/freelancer",
    shareUrl: 'https://taxready.app/freelancer',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'Freelancer & IR35' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'Limited company specialist' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'Contractor & IR35' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Freelancer accounts' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'},{l:'32%',t:'52%'},{l:'60%',t:'68%'},{l:'48%',t:'80%'},{l:'75%',t:'48%'},{l:'20%',t:'68%'},{l:'50%',t:'24%'}]
  },

  landlord: {
    label: 'Landlords',
    eyebrow: 'For landlords',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">built for landlords.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '18,000',
    incomeHint: 'Total rental income received this year — approximate is fine',
    tiers: [
      { name:'Light', desc:'Minimal property costs', totalDeduction:1800, pensionAmount:0, tags:['🔧 Minor repairs','📋 Building insurance','📱 Admin costs','🚗 Property visits'] },
      { name:'Typical', desc:'Common landlord claims', totalDeduction:4500, pensionAmount:0, tags:['🔧 Repairs & maintenance','🏠 Letting agent fees','📋 Insurance','⚖️ Professional fees','🚗 Travel to properties'] },
      { name:'Full', desc:'Higher deductible costs', totalDeduction:8500, pensionAmount:0, tags:['🔧 Repairs (major)','🏠 Letting agent fees','📋 Insurance','⚖️ Legal & accounting','💡 Utilities (void periods)','🚗 Travel to properties'] },
    ],
    notesPH: 'e.g. I have 2 properties, one is an HMO, I have a buy-to-let mortgage',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my 2025/26 landlord tax — free, 30 seconds. Landlord tax is complicated, and 5.6m UK workers overpaid HMRC in 2023/24. If you own property, worth a look:\n\nhttps://taxready.app/landlord",
    shareUrl: 'https://taxready.app/landlord',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'Property & landlord tax' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'HMO & Section 24' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'Buy-to-let specialist' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Property investment' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'},{l:'32%',t:'52%'},{l:'60%',t:'68%'},{l:'48%',t:'80%'},{l:'75%',t:'48%'},{l:'20%',t:'68%'},{l:'50%',t:'24%'}]
  },

  hospitality: {
    label: 'Hospitality & Food',
    eyebrow: 'For hospitality & food',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">built for hospitality & food.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '28,000',
    incomeHint: 'Total income including cash and card — approximate is fine',
    tiers: [
      { name:'Light', desc:'Basic trading costs', totalDeduction:3500, pensionAmount:0, tags:['🥩 Ingredients & stock','📦 Packaging & supplies','📱 Card reader & tech','🛡 Insurance'] },
      { name:'Typical', desc:'Common hospitality claims', totalDeduction:7800, pensionAmount:800, tags:['🥩 Ingredients & stock','🚗 Vehicle & deliveries','📦 Packaging','⚡ Utilities','📱 Tech & card reader','💰 Pension'] },
      { name:'Full', desc:'All typical deductions', totalDeduction:14200, pensionAmount:1200, tags:['🥩 Ingredients','🚗 Vehicle & deliveries','👨‍🍳 Staff costs','🏠 Premises & rates','⚡ Utilities','📦 Packaging','💰 Pension'] },
    ],
    notesPH: 'e.g. I run a café, receive tips, operate a food truck at markets',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my 2025/26 tax as a UK hospitality worker — free, 30 seconds. 5.6m UK workers overpaid HMRC in 2023/24 — average of £625 among those affected. Worth checking yours:\n\nhttps://taxready.app/hospitality",
    shareUrl: 'https://taxready.app/hospitality',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'Hospitality & food' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'TRONC & catering' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'Sole trader & VAT' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Hospitality specialist' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'},{l:'32%',t:'52%'},{l:'60%',t:'68%'},{l:'48%',t:'80%'},{l:'75%',t:'48%'},{l:'20%',t:'68%'},{l:'50%',t:'24%'}]
  },

  healthcare: {
    label: 'Healthcare & Locums',
    eyebrow: 'For healthcare & locums',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">built for healthcare & locums.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '54,000',
    incomeHint: 'Total income from all sources — NHS, locum, private. Approximate is fine.',
    tiers: [
      { name:'Light', desc:'Basic professional costs', totalDeduction:5300, pensionAmount:2800, tags:['🚗 Travel between sites','🩺 Equipment & scrubs','📋 GMC/NMC registration','💰 NHS pension (~5%)'] },
      { name:'Typical', desc:'Common healthcare claims', totalDeduction:10900, pensionAmount:5400, tags:['🚗 Travel (multi-site)','🩺 Equipment','📋 Registration','📚 CPD & training','🛡 Indemnity cover','💰 NHS/SIPP pension (~10%)'] },
      { name:'Full', desc:'All typical deductions', totalDeduction:15500, pensionAmount:7000, tags:['🚗 Travel (all sites)','🩺 Equipment & kit','📋 Registration','📚 CPD (higher)','🛡 Full indemnity cover','💼 Accountancy fees','💰 NHS/SIPP pension (higher)'] },
    ],
    notesPH: 'e.g. I work bank shifts at multiple trusts, have locum agency income, contribute to NHS pension',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my 2025/26 healthcare/locum tax — free, 30 seconds, no sign-up. 5.6m UK workers overpaid HMRC in 2023/24. If you work in healthcare, worth checking:\n\nhttps://taxready.app/healthcare",
    shareUrl: 'https://taxready.app/healthcare',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'Healthcare & NHS locums' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'GP & locum specialist' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'NHS & private practice' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Healthcare professional' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'},{l:'32%',t:'52%'},{l:'60%',t:'68%'},{l:'48%',t:'80%'},{l:'75%',t:'48%'},{l:'20%',t:'68%'},{l:'50%',t:'24%'}]
  },

  othersmallbusiness: {
    label: 'Other',
    eyebrow: 'Sole trader, small business & other self-employed',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">other sole traders & small businesses.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '32,000',
    incomeHint: 'Total business income this year — approximate is fine',
    tiers: [
      { name:'Light', desc:'Basic running costs', totalDeduction:2500, pensionAmount:0, tags:['🏠 Home office','📱 Phone & internet','🚗 Mileage (low)','☁️ Software & subs'] },
      { name:'Typical', desc:'Common sole trader claims', totalDeduction:7600, pensionAmount:1600, tags:['🏠 Home office','🚗 Vehicle & mileage','📱 Phone','🛡 Insurance','📣 Marketing','💰 Pension (SIPP)'] },
      { name:'Full', desc:'All typical deductions', totalDeduction:14400, pensionAmount:2400, tags:['🏠 Home office (full)','🚗 Vehicle & mileage','📱 Phone','🛡 Insurance','📣 Marketing','📦 Stock & materials','💼 Accountancy fees','💰 Pension (SIPP)'] },
    ],
    notesPH: 'e.g. I run a cleaning business, work as a tutor or dog walker, or have a small service business',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my 2025/26 sole trader tax — free, 30 seconds, no sign-up. Most small business owners miss allowable expenses. Worth a check:\n\nhttps://taxready.app/othersmallbusiness",
    shareUrl: 'https://taxready.app/othersmallbusiness',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'Sole trader & small business' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'Self-employed specialist' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'Small business accounts' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Sole trader & VAT' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'},{l:'32%',t:'52%'},{l:'60%',t:'68%'},{l:'48%',t:'80%'},{l:'75%',t:'48%'},{l:'20%',t:'68%'},{l:'50%',t:'24%'}]
  },

  retail: {
    label: 'Retail & Ecommerce',
    eyebrow: 'For retail & ecommerce businesses',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">built for retail & ecommerce.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '45,000',
    incomeHint: 'Total business turnover this year — approximate is fine',
    tiers: [
      { name:'Light', desc:'Basic retail costs', totalDeduction:4000, pensionAmount:0, tags:['📦 Stock & materials','🏪 Premises costs','📱 Phone & internet','☁️ Software & ecommerce'] },
      { name:'Typical', desc:'Common retail claims', totalDeduction:9500, pensionAmount:1500, tags:['📦 Stock & COGS','🏪 Premises & rent','📱 Phone','🚗 Delivery & travel','💻 Ecommerce platform','🛡 Insurance','💰 Pension (SIPP)'] },
      { name:'Full', desc:'All typical deductions', totalDeduction:16000, pensionAmount:2500, tags:['📦 Stock & COGS','🏪 Premises & fit-out','📱 Phone','🚗 Vehicle & delivery','💻 Platform fees & ads','🛡 Insurance & liability','💼 Accountancy','💰 Pension (SIPP)'] },
    ],
    notesPH: 'e.g. I sell on Shopify or Amazon, run a physical shop, or a mix of both',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my 2025/26 tax as a UK retailer — free, 30 seconds. Most retail & ecommerce businesses miss allowable expenses. Worth a check:\n\nhttps://taxready.app/retail",
    shareUrl: 'https://taxready.app/retail',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'Retail & ecommerce' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'Ecommerce & VAT' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'Shopify & Amazon sellers' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Retail & inventory' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'},{l:'32%',t:'52%'},{l:'60%',t:'68%'},{l:'48%',t:'80%'},{l:'75%',t:'48%'},{l:'20%',t:'68%'},{l:'50%',t:'24%'}]
  },

  creative: {
    label: 'Creatives & Media',
    eyebrow: 'For creatives & media',
    hookH1: 'Your free UK tax estimate in 30 seconds —<br><em class="g-text" style="font-size:0.72em;line-height:1.2;">built for creatives & media.</em>',
    hookSub: 'Rough tax estimate in 30 seconds — then matched to your right local accountant from <strong>3,500+ highly rated local UK firms</strong>, powered by AI.',
    incomePlaceholder: '24,000',
    incomeHint: 'Total income from all creative work — approximate is fine',
    tiers: [
      { name:'Light', desc:'Basic creative costs', totalDeduction:1800, pensionAmount:0, tags:['📷 Basic kit & equipment','💻 Software & subscriptions','📱 Phone & internet'] },
      { name:'Typical', desc:'Common creative claims', totalDeduction:5800, pensionAmount:800, tags:['📷 Equipment','💻 Software & editing','📱 Phone','🏠 Home studio','🚗 Travel to jobs','💰 Pension (SIPP)'] },
      { name:'Full', desc:'All typical deductions', totalDeduction:11000, pensionAmount:1500, tags:['📷 Full kit & cameras','💻 Software & editing','📱 Phone','🏠 Home studio (full)','🚗 Travel','👔 Props & costumes','📣 Marketing & website','💰 Pension (SIPP)'] },
    ],
    notesPH: 'e.g. I earn from photography, YouTube, brand deals, and sell prints',
    mapCount: '3,500+', mapCountLabel: 'Local firms',
    shareText: "I just checked my 2025/26 tax as a UK creative — free, 30 seconds. Creatives often overpay because of irregular income. 5.6m UK workers overpaid HMRC last year. Check yours:\n\nhttps://taxready.app/creative",
    shareUrl: 'https://taxready.app/creative',
    accountants: [
      { name:'Hartley & Co Accountants', loc:'Manchester', cert:'ICAEW', rating:'4.9', reviews:47, spec:'Creative & media' },
      { name:'Pierce Mitchell LLP', loc:'Birmingham', cert:'ACCA', rating:'4.7', reviews:31, spec:'Influencer & content' },
      { name:'Forsyth Tax Advisory', loc:'Leeds', cert:'ICAEW', rating:'5.0', reviews:22, spec:'Arts & photography' },
      { name:'Aldridge & Partners', loc:'Bristol', cert:'ACCA', rating:'4.8', reviews:18, spec:'Music & media' },
    ],
    dots:[{l:'38%',t:'36%'},{l:'55%',t:'44%'},{l:'64%',t:'57%'},{l:'27%',t:'60%'},{l:'70%',t:'28%'},{l:'43%',t:'72%'},{l:'32%',t:'52%'},{l:'60%',t:'68%'},{l:'48%',t:'80%'},{l:'75%',t:'48%'},{l:'20%',t:'68%'},{l:'50%',t:'24%'}]
  }
};

// ─── SEO ──────────────────────────────────────────────────────────────────
const SEG_SEO = {
  employed: {
    title: 'UK Tax Calculator for Employed Workers (PAYE) 2025/26 | TaxReady',
    desc:  'Free tax estimate for employed PAYE workers. Salary, bonuses, company benefits, WFH claims — see what you might owe for 2025/26 and connect with a local accountant instantly.'
  },
  construction: {
    title: 'UK Tax Calculator for Construction & Trades 2025/26 | TaxReady',
    desc:  'Free tax estimate for builders, electricians, plumbers and tradespeople. CIS, van expenses, tools — see what you might owe and send it to a local accountant in one click.'
  },
  freelancer: {
    title: 'UK Tax Calculator for Freelancers & Contractors 2025/26 | TaxReady',
    desc:  'Free tax estimate for developers, designers, consultants and IR35 contractors. See what you might owe for 2025/26 and connect with a local accountant instantly.'
  },
  landlord: {
    title: 'UK Landlord Tax Calculator 2025/26 | TaxReady',
    desc:  'Free tax estimate for UK landlords. Section 24, HMO, buy-to-let — see your 2025/26 position in 30 seconds and send it to a local accountant in one click.'
  },
  hospitality: {
    title: 'UK Tax Calculator for Hospitality & Food Workers 2025/26 | TaxReady',
    desc:  'Free tax estimate for café owners, chefs, caterers and food businesses. Tips, TRONC, VAT — see what you might owe and connect with a local accountant.'
  },
  healthcare: {
    title: 'UK Tax Calculator for Healthcare Workers & Locums 2025/26 | TaxReady',
    desc:  'Free tax estimate for NHS locums, GPs, nurses and healthcare workers. Multiple employers, indemnity, CPD — see your 2025/26 position in 30 seconds.'
  },
  othersmallbusiness: {
    title: 'UK Tax Calculator for Sole Traders & Small Businesses 2025/26 | TaxReady',
    desc:  'Free tax estimate for sole traders, small businesses and other self-employed. See your 2025/26 position in 30 seconds and connect with a local accountant instantly.'
  },
  retail: {
    title: 'UK Tax Calculator for Retail & Ecommerce 2025/26 | TaxReady',
    desc:  'Free tax estimate for UK retailers, online sellers and ecommerce businesses. Shopify, Amazon, physical shops — see your 2025/26 position in 30 seconds and connect with a local accountant.'
  },
  creative: {
    title: 'UK Tax Calculator for Creatives & Media Professionals 2025/26 | TaxReady',
    desc:  'Free tax estimate for photographers, writers, influencers and musicians. Irregular income, kit, royalties — see what you might owe and connect with a local accountant.'
  }
};
const HUB_SEO = {
  title: "TaxReady — The UK's Free Tax Calculator 2025/26",
  desc:  'See what you might owe HMRC in 30 seconds — then send it to one of 3,500+ highly rated local UK accountants to get it sorted. Free. No sign-up.'
};

function setPageMeta(title, desc) {
  document.title = title;
  const el = document.querySelector('meta[name="description"]');
  if (el) el.setAttribute('content', desc);
}

// ─── STATE ────────────────────────────────────────────────────────────────
let currentSeg = null;
let chartInsts = {};
let selFirm = null, selDetail = null;

// Country derived from URL path — /au/ pages get AUS tax rates and currency
const COUNTRY = (typeof window !== 'undefined' && window.location.pathname.startsWith('/au/')) ? 'au' : 'uk';
const CURRENCY = COUNTRY === 'au' ? 'A$' : '£';
const CURRENCY_CODE = COUNTRY === 'au' ? 'AUD' : 'GBP';
const fmt = n => CURRENCY + Math.round(n).toLocaleString(COUNTRY === 'au' ? 'en-AU' : 'en-GB');
const COUNTRY_NAME = COUNTRY === 'au' ? 'Australian' : 'UK';
const TAX_AUTHORITY = COUNTRY === 'au' ? 'ATO' : 'HMRC';

function getSegSEO(key) {
  const base = SEG_SEO[key];
  if (!base) return null;
  if (COUNTRY !== 'au') return base;
  return {
    title: base.title.replace(/\bUK\b/g, 'Australian').replace('2025/26', '2025-26'),
    desc:  base.desc.replace(/\bUK\b/g, 'Australian').replace(/\bHMRC\b/g, 'ATO').replace('2025/26', '2025-26')
  };
}
function getHubSEO() {
  return COUNTRY === 'au'
    ? { title: "TaxReady — Australia's Free Tax Calculator 2025-26", desc: "See what you might owe the ATO in 30 seconds — then send it to a local Australian accountant to get it sorted. Free. No sign-up." }
    : HUB_SEO;
}

// ─── GOOGLE SHEETS / HUB MAP ──────────────────────────────────────────────
const SHEET_CSV_URL = '/accountants-template.csv';
const SUBMISSIONS_URL = 'https://webhooks.eu.workato.com/webhooks/rest/78052486-2cd0-41d0-9240-624a9e215335/taxready-submission';

let allFirms = [];
let hubMap = null;
let hubMarkers = [];

// Returns the live firm count rounded down to the nearest 100 (e.g. 3,742 → "3,700+")
function firmCountStr() {
  const n = allFirms.length;
  return n > 0 ? (Math.floor(n / 100) * 100).toLocaleString('en-GB') + '+' : '3,500+';
}

// Maps each segment key to its Xero-specialty flag in accountants-template.csv
const SEG_FLAG = {
  construction: 'flag_construction',
  hospitality:  'flag_hospitality',
  healthcare:   'flag_healthcare',
  creative:     'flag_media',
  landlord:     'flag_real_estate',
  freelancer:   'flag_professional_services',
  retail:       'flag_retail',
};

// Returns the best teaser firm for a given segment, preferring firms with the matching specialty flag
function teaserForSeg(key) {
  const flag = SEG_FLAG[key];
  const pool = flag ? allFirms.filter(f => f[flag]) : allFirms;
  const source = pool.length ? pool : allFirms;
  return source.find(f => parseFloat(f.rating) >= 4.8 && f.reviews > 50) || source[0] || allFirms[0];
}

function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function makeTealMarker(lat, lng) {
  return L.circleMarker([lat, lng], {
    radius: 7, fillColor: '#00B1B2', fillOpacity: 1, color: 'white', weight: 2.5
  });
}

async function loadHubData() {
  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) {
      console.error('[TaxReady] Gsheet fetch failed:', res.status, res.statusText);
      return;
    }
    const text = await res.text();
    const rows = text.trim().split('\n').slice(1); // skip header row
    console.log('[TaxReady] Gsheet rows received:', rows.length);

    // Expected country for this page (GB on /uk/ pages, AU on /au/ pages)
    const pageCountry = COUNTRY === 'au' ? 'AU' : 'GB';

    const parsed = rows.map(row => {
      const cols = parseCSVRow(row);
      // columns: place_id, name, address, country, suburb, city, rating, reviews, longitude, latitude, postcode, outward_code,
      //          flag_hospitality, flag_construction, flag_healthcare, flag_media, flag_professional_services, flag_real_estate,
      //          _place_id2, Badge, claimed, specialisms, fees, client_type, focus_area, client_portal, accreditations,
      //          submitted-entry, firm_slug, city_slug, specalist-segments, bio, website
      const [place_id, name, address, country, suburb, city, rating, reviews, longitude, latitude, postcode, outward_code,
        flag_hospitality, flag_construction, flag_healthcare, flag_media, flag_professional_services, flag_real_estate,
        _place_id2, badge, claimed, specialisms, fees, client_type, focus_area, client_portal, accreditations,
        submitted, firm_slug, city_slug, specalist_segments, bio, website] = cols;
      return {
        name:         name?.trim(),
        city:         city?.trim(),
        postcode:     postcode?.trim().toUpperCase() || '',
        outward_code: outward_code?.trim().toUpperCase() || '',
        rating:       rating?.trim(),
        reviews:      parseInt(reviews?.trim()) || 0,
        lat:          parseFloat(latitude?.trim()),
        lng:          parseFloat(longitude?.trim()),
        country:      (country?.trim() || 'GB').toUpperCase(),
        flag_hospitality:           flag_hospitality?.trim()           === 'TRUE',
        flag_construction:          flag_construction?.trim()          === 'TRUE',
        flag_healthcare:            flag_healthcare?.trim()            === 'TRUE',
        flag_media:                 flag_media?.trim()                 === 'TRUE',
        flag_professional_services: flag_professional_services?.trim() === 'TRUE',
        flag_real_estate:           flag_real_estate?.trim()           === 'TRUE',
      };
    });

    allFirms = parsed.filter(f => f.name && !isNaN(f.lat) && !isNaN(f.lng) && f.country === pageCountry);
    console.log('[TaxReady] Firms parsed:', parsed.length, '| Passing filter (country=' + pageCountry + '):', allFirms.length);
    if (parsed.length > 0) {
      const s = parsed[0];
      console.log('[TaxReady] First row sample — name:', s.name, '| lat:', s.lat, '| lng:', s.lng, '| country:', s.country);
    }

    // Update all hardcoded firm-count spans in the HTML with the live count
    const countStr = firmCountStr();
    document.querySelectorAll('.js-firm-count').forEach(el => { el.textContent = countStr; });

    initHubMap();
    initHubMiniMap();
    initHubMobileMap();
    renderHubFirms();
    // Handle deep-link hash now that firms are loaded
    const hash = window.location.hash.replace('#', '');
    if (hash && SEGMENTS[hash]) showSeg(hash);
  } catch (e) {
    console.error('[TaxReady] Failed to load firms:', e);
  }
}

function initSegHeroMobileMap(key) {
  const el = document.getElementById('leaflet-seg-hero-mobile-' + key);
  if (!el || el._leaflet_id) return;
  const map = L.map(el, {
    zoomControl: false, attributionControl: false,
    dragging: false, touchZoom: false, doubleClickZoom: false,
    scrollWheelZoom: false, boxZoom: false, keyboard: false
  }).setView(COUNTRY === 'au' ? [-25.3, 133.8] : [53.5, -2.0], COUNTRY === 'au' ? 4.0 : 5.2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  segFirmsFor(key).forEach(f => {
    L.circleMarker([f.lat, f.lng], {
      radius: 3, fillColor: ratingColor(f.rating), fillOpacity: 0.85,
      color: 'white', weight: 1, interactive: false
    }).addTo(map);
  });
  // Update mobile badge with real firm
  const badge = document.getElementById('seg-badge-mobile-' + key);
  const teaser = teaserForSeg(key);
  if (badge && teaser) {
    badge.innerHTML = `
      <span class="ai-dot"></span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:600;">AI matched</span><br>
      <strong style="font-size:12px;color:#0f0f0e;">${teaser.name}</strong><br>
      <span style="font-size:11px;color:#6b6b66;">${teaser.city} · ★ ${teaser.rating} · ${teaser.reviews} reviews</span>`;
  }
}

function initSegHeroMap(key) {
  const el = document.getElementById('leaflet-seg-hero-' + key);
  if (!el || el._leaflet_id) return;
  const map = L.map(el, {
    zoomControl: false, attributionControl: false,
    dragging: false, touchZoom: false, doubleClickZoom: false,
    scrollWheelZoom: false, boxZoom: false, keyboard: false
  }).setView(COUNTRY === 'au' ? [-25.3, 133.8] : [53.5, -2.0], COUNTRY === 'au' ? 4.0 : 6.8);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  segFirmsFor(key).forEach(f => {
    L.circleMarker([f.lat, f.lng], {
      radius: 4, fillColor: ratingColor(f.rating), fillOpacity: 0.85,
      color: 'white', weight: 1, interactive: false
    }).addTo(map);
  });
  // Update badge with a real firm + segment specialist tag
  const badge = el.parentElement.querySelector('.seg-map-badge');
  const teaser = teaserForSeg(key);
  const segSpec = (SEGMENTS[key]?.accountants?.[0]?.spec) || ((SEGMENTS[key]?.eyebrow || '').replace('For ', '') + ' specialist');
  if (badge && teaser) {
    badge.innerHTML = `
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:600;margin-bottom:4px;">
        <span class="ai-dot"></span>AI matched
      </div>
      <div style="font-size:12px;font-weight:700;color:#0f0f0e;margin-bottom:2px;">${teaser.name}</div>
      <div style="font-size:11px;color:#6b6b66;margin-bottom:6px;">${teaser.city} · ★ ${teaser.rating} · ${teaser.reviews} reviews</div>
      <span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 7px;display:inline-block;">${segSpec}</span>`;
  }
  // Also invalidate after tiles load
  setTimeout(() => map.invalidateSize(), 200);
}

function initHubMobileMap() {
  const el = document.getElementById('leaflet-hub-mobile-map');
  if (!el || el._leaflet_id) return;
  const map = L.map(el, {
    zoomControl: false, attributionControl: false,
    dragging: false, touchZoom: false, doubleClickZoom: false,
    scrollWheelZoom: false, boxZoom: false, keyboard: false
  }).setView(COUNTRY === 'au' ? [-25.3, 133.8] : [52.8, -1.5], COUNTRY === 'au' ? 4.0 : 5.2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  allFirms.forEach(f => {
    L.circleMarker([f.lat, f.lng], {
      radius: 3, fillColor: ratingColor(f.rating), fillOpacity: 0.85,
      color: 'white', weight: 1, interactive: false
    }).addTo(map);
  });
  const badge = document.getElementById('hub-mobile-map-badge');
  const teaser = allFirms.find(f => parseFloat(f.rating) >= 4.8 && f.reviews > 50) || allFirms[0];
  const segSpec = 'Ecommerce Specialist';
  if (badge && teaser) {
    badge.innerHTML = `
      <span class="ai-dot"></span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:600;">AI matched</span><br>
      <strong style="font-size:12px;color:#0f0f0e;">${teaser.name}</strong><br>
      <span style="font-size:11px;color:#6b6b66;">${teaser.city} · ★ ${teaser.rating} · ${teaser.reviews} reviews</span><br>
      <span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 7px;display:inline-block;margin-top:5px;">${segSpec}</span>`;
  }
}

function initHubMiniMap() {
  const el = document.getElementById('leaflet-hub-mini-map');
  if (!el || el._leaflet_id) return;
  const map = L.map(el, {
    zoomControl: false, attributionControl: false,
    dragging: false, touchZoom: false, doubleClickZoom: false,
    scrollWheelZoom: false, boxZoom: false, keyboard: false
  }).setView(COUNTRY === 'au' ? [-25.3, 133.8] : [52.8, -1.5], COUNTRY === 'au' ? 4.0 : 5.8);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  allFirms.forEach(f => {
    L.circleMarker([f.lat, f.lng], {
      radius: 4, fillColor: ratingColor(f.rating), fillOpacity: 0.85,
      color: 'white', weight: 1, interactive: false
    }).addTo(map);
  });
  const badge = document.getElementById('hub-mini-map-badge');
  const teaser = allFirms.find(f => parseFloat(f.rating) >= 4.8 && f.reviews > 50) || allFirms[0];
  const segSpec = 'Ecommerce Specialist';
  if (badge && teaser) {
    badge.innerHTML = `
      <span class="ai-dot"></span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:600;">AI matched</span><br>
      <strong style="font-size:12px;color:#0f0f0e;">${teaser.name}</strong><br>
      <span style="font-size:11px;color:#6b6b66;">${teaser.city} · ★ ${teaser.rating} · ${teaser.reviews} reviews</span><br>
      <span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 7px;display:inline-block;margin-top:6px;">${segSpec}</span>`;
  }
}

function initHubMap() {
  const el = document.getElementById('leaflet-hub-map');
  if (!el || el._leaflet_id) return;
  const map = L.map(el, { zoomControl: true, attributionControl: false })
    .setView(COUNTRY === 'au' ? [-25.3, 133.8] : [52.8, -1.5], COUNTRY === 'au' ? 4.0 : 6.2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  hubMarkers = [];
  allFirms.forEach(f => {
    const m = L.circleMarker([f.lat, f.lng], {
      radius: 7, fillColor: ratingColor(f.rating), fillOpacity: 1, color: 'white', weight: 2.5
    })
      .addTo(map)
      .bindPopup(`<b style="font-size:11px">${f.name}</b><br><span style="font-size:10px;color:#6b6b66">${f.city} · ★ ${f.rating} (${f.reviews} reviews)</span>`)
      .on('mouseover', function() { this.openPopup(); });
    hubMarkers.push({ marker: m, firm: f });
  });
  hubMap = map;
}

async function searchHubPostcode() {
  const input = document.getElementById('postcode-input-hub');
  if (!input) return;
  const postcode = input.value.trim().replace(/\s+/g, '');
  if (!postcode) return;
  const btn = input.nextElementSibling;
  btn.textContent = '…';
  input.style.outline = '';
  try {
    const res = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(postcode));
    const data = await res.json();
    if (data.status !== 200) { input.style.outline = '2px solid #cc2200'; btn.textContent = 'Search'; return; }
    const { latitude, longitude } = data.result;
    if (hubMap) {
      hubMap.setView([latitude, longitude], 11);
      const nearby = hubMarkers.filter(({ firm }) => haversineKm(latitude, longitude, firm.lat, firm.lng) <= 50);
      const show = nearby.length ? nearby : hubMarkers;
      hubMarkers.forEach(({ marker }) => marker.remove());
      show.forEach(({ marker }) => marker.addTo(hubMap));
    }
  } catch(e) {
    input.style.outline = '2px solid #cc2200';
  }
  btn.textContent = 'Search';
}

function renderHubFirms() {
  const el = document.getElementById('hub-firms-list');
  if (!el) return;
  const _maxRev = Math.max(...allFirms.map(f => f.reviews), 1);
  const _scoreD = f => 0.3 * (parseFloat(f.rating) / 5) + 0.7 * Math.min(1, f.reviews / _maxRev);
  const top4 = [...allFirms].sort((a, b) => _scoreD(b) - _scoreD(a)).slice(0, 4);
  const moreCount = Math.max(0, allFirms.length - 4).toLocaleString();
  el.innerHTML = top4.map(f => `
    <div onclick="window.scrollTo({top:0,behavior:'smooth'})" style="background:white;border:1.5px solid #e8e8e3;border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;">
      <div style="min-width:0;flex:1;">
        <div style="font-size:14px;font-weight:600;color:#0f0f0e;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
          <span style="width:6px;height:6px;background:${ratingColor(f.rating,f.reviews)};border-radius:50%;flex-shrink:0;display:inline-block;"></span>${f.name}
        </div>
        <div style="font-size:11px;color:#6b6b66;">📍 ${f.city}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="color:#f5c842;font-size:12px;letter-spacing:1px;margin-bottom:2px;">★★★★★</div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:#0f0f0e;">${f.rating}</div>
        <div style="font-size:9px;color:#6b6b66;">${f.reviews} reviews</div>
      </div>
    </div>
  `).join('') + `<div style="font-size:12px;color:#6b6b66;padding:8px 0 4px;">+ ${moreCount} more across ${COUNTRY_NAME} · <span onclick="window.scrollTo({top:0,behavior:'smooth'})" style="color:#00B1B2;cursor:pointer;font-weight:500;">Choose your trade above →</span></div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadHubData();
});


// ─── SEGMENT MAPS ─────────────────────────────────────────────────────────
const segMaps = {};
const segMapMarkers = {};

function segFirmsFor(key) {
  const flag = SEG_FLAG[key];
  const filtered = flag ? allFirms.filter(f => f[flag]) : allFirms;
  return filtered.length ? filtered : allFirms;
}

function initSegMap(key) {
  const el = document.getElementById('leaflet-seg-' + key);
  if (!el || el._leaflet_id) return;
  const map = L.map(el, { zoomControl: true, attributionControl: false })
    .setView(COUNTRY === 'au' ? [-25.3, 133.8] : [52.8, -1.5], COUNTRY === 'au' ? 4.0 : 6.2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  segMapMarkers[key] = [];
  segFirmsFor(key).forEach(f => {
    const m = L.circleMarker([f.lat, f.lng], {
      radius: 7, fillColor: ratingColor(f.rating), fillOpacity: 1, color: 'white', weight: 2.5
    }).addTo(map);
    segMapMarkers[key].push({ marker: m, firm: f });
  });

  segMaps[key] = map;
  setTimeout(() => map.invalidateSize(), 200);
}

// ─── RESULTS MAP ──────────────────────────────────────────────────────────
const resultsMaps = {};
const resultsMarkers = {}; // { [key]: { ["name|city"]: marker } }
const resultsRecommended = {}; // { [key]: Array<{ marker, firmName, color }> }

function setRecommendedMarkers(key, firms) {
  (resultsRecommended[key] || []).forEach(r => r.marker.remove());
  resultsRecommended[key] = [];
  if (!firms.length || !resultsMaps[key]) return;
  const flag    = SEG_FLAG[key];
  const segSpec = (SEGMENTS[key]?.accountants?.[0]?.spec) || '';
  resultsRecommended[key] = firms.map(firm => {
    const color    = '#22c55e';
    const specLine = (segSpec && (!flag || firm[flag]))
      ? `<br><span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:3px;padding:1px 5px;">${segSpec}</span>`
      : '';
    const marker = L.marker([firm.lat, firm.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;background:${color};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:black;font-size:11px;line-height:1;box-shadow:0 2px 5px rgba(0,0,0,0.3);">★</div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      }),
      zIndexOffset: 1000
    })
      .addTo(resultsMaps[key])
      .bindPopup(`<b style="font-size:11px">${firm.name}</b><br><span style="font-size:10px;color:#6b6b66">${firm.city} · ★ ${firm.rating} (${firm.reviews} reviews)</span><br><span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:3px;padding:1px 5px;margin-right:4px;"><span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#22c55e;margin-right:3px;vertical-align:middle;"></span>AI Matched</span>${specLine}`)
      .on('mouseover', function() { this.openPopup(); })
      .on('click', function() { pickCardFromMap(key, firm.name, firm.city); });
    return { marker, firmKey: firm.name + '|' + firm.city, color };
  });
}

function ratingColor(rating) {
  const r = parseFloat(rating) || 0;
  if (r >= 4) return '#86efac';   // green  — 4+ stars
  if (r >= 3) return '#fdba74';   // orange — 3+ stars
  return '#fca5a5';               // red    — under 3 stars
}

function highlightResultsMarker(key, firmName) {
  const markers = resultsMarkers[key];
  if (!markers) return;
  Object.entries(markers).forEach(([name, marker]) => {
    if (name === firmName) {
      marker.setStyle({ fillColor: '#3b82f6', fillOpacity: 1 });
    } else {
      marker.setStyle({ fillColor: marker._ratingColor, fillOpacity: 1 });
    }
  });
  // Update star marker colours for all recommended firms
  (resultsRecommended[key] || []).forEach(r => {
    const el = r.marker.getElement()?.querySelector('div');
    if (el) el.style.background = r.firmKey === firmName ? '#3b82f6' : r.color;
  });
}

function pickCardFromMap(key, firm, detail) {
  const firmKey = firm + '|' + detail;
  highlightResultsMarker(key, firmKey);
  const m = resultsMarkers[key]?.[firmKey];
  if (m) m.openPopup();
  const list = document.getElementById('acc-list-' + key);
  if (list) {
    list.querySelectorAll('.acc-card').forEach(c => {
      c.classList.remove('selected');
      if (c.dataset.name === firm) c.classList.add('selected');
    });
  }
  selFirm = firm; selDetail = detail;
  const page = document.getElementById('seg-' + key);
  const form = page.querySelector('.send-form');
  form.querySelector('.sf-firm-name').textContent = firm;
  form.querySelector('.sf-firm-detail').textContent = detail;
  form.style.display = 'block';
  const errAcc = document.getElementById('err-acc-' + key);
  if (errAcc) errAcc.style.display = 'none';
  setTimeout(() => form.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function initResultsMap(key) {
  const el = document.getElementById('leaflet-results-' + key);
  if (!el || el._leaflet_id) return;
  const map = L.map(el, { zoomControl: false, attributionControl: false })
    .setView(COUNTRY === 'au' ? [-25.3, 133.8] : [52.8, -1.5], COUNTRY === 'au' ? 4.0 : 5.5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  resultsMarkers[key] = {};
  const flag    = SEG_FLAG[key];
  const segSpec = (SEGMENTS[key]?.accountants?.[0]?.spec) || '';
  allFirms.forEach(f => {
    const color = ratingColor(f.rating);
    const specLine = (flag && f[flag] && segSpec)
      ? `<br><span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:3px;padding:1px 5px;">${segSpec}</span>`
      : '';
    const marker = L.circleMarker([f.lat, f.lng], {
      radius: 7, fillColor: color, fillOpacity: 1, color: 'white', weight: 2.5
    })
      .addTo(map)
      .bindPopup(`<b style="font-size:11px">${f.name}</b><br><span style="font-size:10px;color:#6b6b66">${f.city} · ★ ${f.rating} (${f.reviews} reviews)</span>${specLine}`)
      .on('mouseover', function() { this.openPopup(); })
      .on('click', function() { pickCardFromMap(key, f.name, f.city); });
    marker._ratingColor = color;
    resultsMarkers[key][f.name + '|' + f.city] = marker;
  });
  resultsMaps[key] = map;
  // invalidateSize forces Leaflet to re-measure the container after the browser
  // has finished painting — fixes 0×0 init on mobile where layout isn't done yet
  setTimeout(() => map.invalidateSize(), 100);
  renderAccList(key, null, null, null); // initial render — no stars until postcode entered
}

async function searchResultsPostcode(key) {
  const input = document.getElementById('results-postcode-' + key);
  if (!input) return;
  const raw = input.value.trim().toUpperCase();
  const postcode = raw.replace(/\s+/g, ''); // space-free for postcodes.io
  if (!postcode) return;
  // outward code = everything before the space, or all-but-last-3-chars for space-free input
  const outwardCode = raw.includes(' ') ? raw.split(' ')[0] : postcode.slice(0, -3) || postcode;
  const btn = input.nextElementSibling;
  btn.textContent = '…';
  input.style.outline = '';
  try {
    const res = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(postcode));
    const data = await res.json();
    if (data.status !== 200) { input.style.outline = '2px solid #cc2200'; btn.textContent = 'Find nearest'; return; }
    const { latitude, longitude } = data.result;
    if (resultsMaps[key]) {
      resultsMaps[key].invalidateSize(); // re-measure in case map was init'd at 0×0 on mobile
      resultsMaps[key].setView([latitude, longitude], 13);
    }
    renderAccList(key, outwardCode, latitude, longitude);
  } catch(e) {
    input.style.outline = '2px solid #cc2200';
  }
  btn.textContent = 'Find nearest';
}

// ── Top-4 selection — composite weighted score ────────────────────────────
// Score = 25% submission (placeholder 0) + 25% specialist + 25% proximity + 25% reviews/rating
function selectTop4(key, outwardCode, lat, lng) {
  const flag   = SEG_FLAG[key]; // undefined → no specialist filter
  const maxRev = Math.max(...allFirms.map(f => f.reviews), 1);

  const score = f => {
    // A — Submission data (25%): no data yet, everyone scores 0
    const scoreA = 0;

    // B — Specialist match (25%): 1 if firm holds the segment's xero flag, else 0
    const scoreB = flag && f[flag] ? 1 : 0;

    // C — Proximity (25%): linear decay — full score at 0km, zero at 50km+
    const scoreC = (lat != null && lng != null)
      ? Math.max(0, 1 - haversineKm(lat, lng, f.lat, f.lng) / 50)
      : 0;

    // D — Reviews + Rating (25%): 70% review count, 30% star rating (both normalised 0–1)
    const scoreD = 0.3 * (parseFloat(f.rating) / 5) +
                   0.7 * Math.min(1, f.reviews / maxRev);

    return 0.25*scoreA + 0.25*scoreB + 0.25*scoreC + 0.25*scoreD;
  };

  const ranked = allFirms
    .map(f => ({ f, s: score(f), name: (f.name || '').toLowerCase() }))
    .sort((a, b) => (b.s - a.s) || a.name.localeCompare(b.name));

  return ranked.slice(0, 4).map(r => r.f);
}

function renderAccList(key, outwardCode, fallbackLat, fallbackLng) {
  const el = document.getElementById('acc-list-' + key);
  if (!el) return;

  const firms = selectTop4(key, outwardCode, fallbackLat, fallbackLng);

  // Stars only appear after a postcode is entered
  setRecommendedMarkers(key, outwardCode ? firms : []);

  const flag = SEG_FLAG[key];
  const segSpec = (SEGMENTS[key]?.accountants?.[0]?.spec) || '';

  el.innerHTML = firms.map(f => {
    // Specialist badge: shown if firm is flagged, OR if segment has no flag column (all qualify)
    const showSpec = segSpec && (!flag || f[flag]);
    return `
    <div class="acc-card" data-name="${(f.name||'').replace(/"/g,'&quot;')}" data-city="${(f.city||'').replace(/"/g,'&quot;')}" onclick="pickCard(this,this.dataset.name,this.dataset.city,'${key}')">
      <div style="flex:1;min-width:0">
        <div class="acc-name"><span class="acc-ndot" style="background:${ratingColor(f.rating,f.reviews)};"></span>${f.name}</div>
        <div class="acc-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px;">
          <span>📍 ${f.city}</span>
          <span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 7px;"><span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#22c55e;margin-right:3px;vertical-align:middle;"></span>AI Matched</span>
          ${showSpec ? `<span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 7px;">${segSpec}</span>` : ''}
        </div>
      </div>
      <div class="acc-right">
        <div class="acc-rating-block">
          <div class="acc-stars">★★★★★</div>
          <div class="acc-rating-num">${f.rating}</div>
          <div class="acc-reviews">${f.reviews} Google reviews</div>
        </div>
      </div>
    </div>`;
  }).join('');

  fireAccMatchOrbs(key);
}

function fireAccMatchOrbs(key) {
  const finder = document.getElementById('acct-finder-' + key);
  if (!finder) return;

  // Remove any leftover orbs from a previous run
  finder.querySelectorAll('.acc-orb').forEach(o => o.remove());

  const orbColors = [
    'rgba(124,58,237,0.18)',  // purple
    'rgba(231,116,129,0.18)', // pink
    'rgba(126,73,231,0.14)',  // mid-purple
    'rgba(22,163,74,0.14)',   // teal green
    'rgba(231,116,129,0.12)', // soft pink
    'rgba(124,58,237,0.10)',  // very soft purple
  ];
  const borderColors = [
    'rgba(124,58,237,0.35)',
    'rgba(231,116,129,0.35)',
    'rgba(126,73,231,0.3)',
    'rgba(22,163,74,0.3)',
    'rgba(231,116,129,0.25)',
    'rgba(124,58,237,0.2)',
  ];

  // Orbs are scattered across the width of the acc-list
  const finderW = finder.offsetWidth || 620;
  const finderH = finder.offsetHeight || 300;

  const count = 16;
  for (let i = 0; i < count; i++) {
    const orb = document.createElement('div');
    orb.className = 'acc-orb';
    const sz = 10 + Math.random() * 22;          // 10–32px
    const ci = Math.floor(Math.random() * orbColors.length);
    const x = Math.random() * (finderW - sz);
    const y = (0.3 + Math.random() * 0.7) * finderH; // bottom 70% of section
    const dur = 1.6 + Math.random() * 1.0;
    const delay = Math.random() * 0.6;

    orb.style.cssText = `
      width:${sz}px; height:${sz}px;
      left:${x}px; top:${y}px;
      background:${orbColors[ci]};
      border:1px solid ${borderColors[ci]};
      --orb-dur:${dur}s; --orb-delay:${delay}s;
    `;
    finder.appendChild(orb);

    // Self-clean after animation ends
    setTimeout(() => orb.remove(), (dur + delay + 0.1) * 1000);
  }
}

async function searchSegPostcode(key) {
  const input = document.getElementById('postcode-input-' + key);
  if (!input) return;
  const postcode = input.value.trim().replace(/\s+/g, '');
  if (!postcode) return;
  const btn = input.nextElementSibling;
  btn.textContent = '…';
  input.style.outline = '';
  try {
    const res = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(postcode));
    const data = await res.json();
    if (data.status !== 200) { input.style.outline = '2px solid #cc2200'; btn.textContent = 'Search'; return; }
    const { latitude, longitude } = data.result;
    if (segMaps[key]) {
      segMaps[key].setView([latitude, longitude], 11);
      // Filter markers to nearby segment firms
      const pairs = segMapMarkers[key] || [];
      const nearby = pairs.filter(({ firm }) => haversineKm(latitude, longitude, firm.lat, firm.lng) <= 50);
      const show = nearby.length ? nearby : pairs;
      pairs.forEach(({ marker }) => marker.remove());
      show.forEach(({ marker }) => marker.addTo(segMaps[key]));
      // Find nearest segment firm for popup
      const segFirms = segFirmsFor(key);
      const nearest = [...segFirms]
        .sort((a, b) => haversineKm(latitude, longitude, a.lat, a.lng) - haversineKm(latitude, longitude, b.lat, b.lng))
        .find(f => parseFloat(f.rating) >= 4) || segFirms[0];
      if (nearest) {
        const segSpec = (SEGMENTS[key]?.accountants?.[0]?.spec) || ((SEGMENTS[key]?.eyebrow || '').replace('For ', '') + ' specialist');
        const popupContent = `
          <div style="font-family:'IBM Plex Sans',sans-serif;padding:2px 0;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:600;margin-bottom:6px;">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-right:4px;vertical-align:middle;"></span>AI matched
            </div>
            <div style="font-size:12px;font-weight:700;color:#0f0f0e;margin-bottom:4px;">${nearest.name}</div>
            <div style="font-size:11px;color:#6b6b66;margin-bottom:8px;">${nearest.city} · ★ ${nearest.rating} · ${nearest.reviews} reviews</div>
            <span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 7px;display:inline-block;margin-bottom:10px;">${segSpec}</span>
            <div style="background:#0f0f0e;color:white;text-align:center;padding:7px 10px;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;" onclick="window.scrollTo({top:0,behavior:'smooth'})">Get estimate → send to this firm</div>
          </div>`;
        setTimeout(() => {
          L.popup({ maxWidth: 220, className: 'firm-outcome-popup' })
            .setLatLng([nearest.lat, nearest.lng])
            .setContent(popupContent)
            .openOn(segMaps[key]);
        }, 600);
      }
    }
  } catch(e) {
    input.style.outline = '2px solid #cc2200';
  }
  btn.textContent = 'Search';
}

// ─── UK MAP SVG ──────────────────────────────────────────────────────────
const UK_SVG = `<svg class="uk-svg" viewBox="28 2 80 150" xmlns="http://www.w3.org/2000/svg">
  <path d="M62,5 L72,2 L82,5 L90,15 L88,25 L95,40 L100,55 L95,70 L102,85 L100,100 L92,112 L96,125 L90,138 L78,144 L66,140 L58,128 L62,115 L55,100 L46,100 L38,92 L42,78 L52,72 L58,58 L52,45 L62,35 L62,25 L55,15 Z"/>
  <path d="M32,88 L40,84 L44,92 L38,100 L32,94 Z"/>
</svg>`;

// ─── SEGMENT KEY → URL PATH MAPPING ──────────────────────────────────────
const SEG_TO_PATH = {
  employed:           'employed',
  construction:       'construction',
  freelancer:         'freelancer',
  landlord:           'landlord',
  hospitality:        'hospitality',
  healthcare:         'healthcare',
  creative:           'creative',
  retail:             'retail',
  othersmallbusiness: 'small-business',
};

// ─── NAV ────────────────────────────────────────────────────────────────
function showHub() {
  window.location.href = '/' + COUNTRY + '/';
}

function showSeg(key) {
  // On the hub page, navigate to the segment URL instead of rendering inline
  const path = window.location.pathname;
  const isHub = path === '/' + COUNTRY + '/' || path === '/';
  if (isHub) {
    const segPath = SEG_TO_PATH[key] || key;
    window.location.href = '/' + COUNTRY + '/estimate/' + segPath + '/';
    return;
  }
  const seo = getSegSEO(key);
  if (seo) setPageMeta(seo.title, seo.desc);
  currentSeg = key;
  selFirm = null; selDetail = null;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  let page = document.getElementById('seg-'+key);
  if (!page || !page.querySelector('.seg-hero-wrap')) {
    const built = buildSegPage(key);
    if (!page) {
      document.body.insertBefore(built, document.querySelector('footer'));
      page = built;
    } else {
      page.innerHTML = built.innerHTML;
    }
  }
  page.classList.add('active');
  page.querySelector('.seg-hero-wrap').style.display = 'block';
  page.querySelector('.seg-map-section').style.display = 'block';
  page.querySelector('.results-wrap').style.display = 'none';
  page.querySelector('.success-wrap').style.display = 'none';
  const incEl = page.querySelector('.inc-input');
  if (incEl) incEl.value = '';
  page.querySelectorAll('.tier-card').forEach(t => t.classList.remove('selected'));
  page.querySelectorAll('.acc-card').forEach(c => c.classList.remove('selected'));
  const sf = page.querySelector('.send-form');
  if (sf) sf.style.display = 'none';
  const fl = page.querySelector('.file-list');
  if (fl) fl.innerHTML = '';
  const nf = page.querySelector('.notes-field');
  if (nf) nf.value = '';
  const sfName = page.querySelector('.sf-name');
  if (sfName) sfName.value = '';
  const sfEmail = page.querySelector('.sf-email');
  if (sfEmail) sfEmail.value = '';
  const sfBiz = page.querySelector('.sf-biz-structure');
  if (sfBiz) sfBiz.value = '';
  page._income = 0; page._expenses = 0; page._pensionAmount = 0;
  const bd = page.querySelector('.breakdown-body');
  if (bd) bd.style.display = 'none';
  const bt = page.querySelector('.breakdown-toggle');
  if (bt) bt.classList.remove('open');
  requestAnimationFrame(() => {
    initSegMap(key);
    initSegHeroMap(key);
    initSegHeroMobileMap(key);
    // Force Leaflet to recalculate size after page becomes visible
    setTimeout(() => {
      if (segMaps[key]) segMaps[key].invalidateSize();
    }, 150);
  });
  window.scrollTo({top:0, behavior:'smooth'});
}

// ─── BUILD PAGE ──────────────────────────────────────────────────────────
function buildSegPage(key) {
  const d = SEGMENTS[key];
  const page = document.createElement('div');
  page.id = 'seg-'+key;
  page.className = 'page';
  page._income = 0;
  page._expenses = 0;

  // Generate many map dots
  const allDots = d.dots.map(dot => `<div class="mdot" style="left:${dot.l};top:${dot.t}"></div>`).join('');
  const extraDots = [
    {l:'52%',t:'32%'},{l:'30%',t:'44%'},{l:'66%',t:'36%'},{l:'40%',t:'88%'},
    {l:'80%',t:'60%'},{l:'22%',t:'56%'},{l:'58%',t:'76%'},{l:'45%',t:'20%'},
    {l:'72%',t:'76%'},{l:'35%',t:'76%'},{l:'62%',t:'88%'},{l:'50%',t:'56%'},
    {l:'28%',t:'32%'},{l:'68%',t:'52%'},{l:'42%',t:'64%'},{l:'55%',t:'60%'},
    {l:'78%',t:'40%'},{l:'25%',t:'76%'},{l:'48%',t:'40%'},{l:'63%',t:'72%'},
  ].map(dot => `<div class="mdot" style="left:${dot.l};top:${dot.t}"></div>`).join('');

  page.innerHTML = `
  <div style="padding:14px 0 4px;">
    <span class="back-lnk" onclick="showHub()">← All segments</span>
  </div>

  <!-- ══ SEGMENT HERO ══ -->
  <div class="seg-hero-wrap">
    <div class="seg-hero-inner">

      <!-- LEFT: decorative mini map (matches hub layout) -->
      <div class="seg-hero-mini-map">
        <div id="leaflet-seg-hero-${key}" class="seg-hero-mini-map-inner"></div>
        <div class="seg-map-badge">
          <span class="ai-dot"></span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:600;">AI-powered</span><br>
          <strong>${segFirmsFor(key).length > 0 ? segFirmsFor(key).length.toLocaleString() : d.mapCount} accountants found</strong><br>
          <span style="color:#6b6b66;font-size:10px;">Send your estimate in 1 click</span>
        </div>
      </div>

      <!-- RIGHT: text + form -->
      <div class="seg-hero-text">

        <!-- Eyebrow -->
        <div class="seg-eyebrow">${d.eyebrow}</div>

        <!-- H1 — matches hub weight/scale -->
        <h1 class="seg-hook-h1">${d.hookH1.replace('UK ', COUNTRY_NAME + ' ')}</h1>

        <!-- Sub — same weight as hub sub -->
        <p class="seg-hook-sub">${d.hookSub.replace('local UK firms', 'local ' + COUNTRY_NAME + ' firms').replace('3,500+', firmCountStr())}</p>

        <!-- Income input -->
        <div class="income-block">
          <div class="income-label-row">
            <span class="income-label">Your annual income</span>
            <span class="approx-badge">✓ Approximate is fine — takes 30 seconds</span>
          </div>
          <div class="big-input">
            <div class="amount-row">
              <span class="currency">${CURRENCY}</span>
              <input class="amount-input inc-input" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="${d.incomePlaceholder}" min="0" autocomplete="off">
            </div>
          </div>
        </div>

        <div class="err-box" id="err-${key}"></div>
        <button class="black-btn" onclick="doCalc('${key}')">See my 2025/26 tax bill →</button>

        <div class="trust-row">
          <span class="trust-item"><span class="trust-tick">✓</span> Free</span>
          <span class="trust-item"><span class="trust-tick">✓</span> 30 seconds</span>
          <span class="trust-item"><span class="trust-tick">✓</span> No sign-up</span>
        </div>

      </div><!-- /seg-hero-text -->

    </div><!-- /seg-hero-inner -->

    <!-- Mobile-only map (shown below text on small screens) -->
    <div class="seg-hero-mini-map-mobile">
      <div id="leaflet-seg-hero-mobile-${key}" style="width:100%;height:100%;"></div>
      <div class="seg-map-badge" id="seg-badge-mobile-${key}">
        <span class="ai-dot"></span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:600;">AI-powered</span><br>
        <span style="font-size:11px;color:#6b6b66;">Loading matched accountants…</span>
      </div>
    </div>

    <!-- Press stat section — outside flex row, full width below hero -->
    <div class="seg-proof-strip">
      <div style="font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#9b9b96;margin-bottom:8px;">Why we built this</div>
      ${COUNTRY === 'au' ? `
      <div style="font-family:'Playfair Display',serif;font-size:clamp(16px,2.5vw,20px);font-weight:400;color:#0f0f0e;margin-bottom:6px;line-height:1.3;">Millions of Australians may be paying more tax than they need to.</div>
      <div style="font-size:13px;color:#6b6b66;line-height:1.6;margin-bottom:12px;">ATO data shows millions of Australians miss out on legitimate deductions every year. The average tax refund in 2022-23 was <strong style="color:#0f0f0e;">A$2,800</strong> — and many who could claim more simply don't know what they're entitled to. TaxReady gives you a quick estimate — then matches you to the right local accountant to review your situation properly.</div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <div>
          <span style="font-family:'Playfair Display',serif;font-size:clamp(17px,2.5vw,22px);color:#0f0f0e;">3.7m</span>
          <span style="font-size:11px;color:#6b6b66;margin-left:4px;">Australians received refunds in 2022-23</span>
        </div>
        <div class="proof-stat-extra">
          <span style="font-family:'Playfair Display',serif;font-size:clamp(17px,2.5vw,22px);color:#0f0f0e;">A$2,800</span>
          <span style="font-size:11px;color:#6b6b66;margin-left:4px;">average refund amount</span>
        </div>
        <div class="proof-stat-extra">
          <span style="font-family:'Playfair Display',serif;font-size:clamp(17px,2.5vw,22px);color:#0f0f0e;">A$10.4bn</span>
          <span style="font-size:11px;color:#6b6b66;margin-left:4px;">refunded in total</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:#9b9b96;text-transform:uppercase;letter-spacing:0.06em;">Sources:</span>
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:#9b9b96;letter-spacing:0.04em;">ATO</span>
      </div>
      ` : `
      <div style="font-family:'Playfair Display',serif;font-size:clamp(16px,2.5vw,20px);font-weight:400;color:#0f0f0e;margin-bottom:6px;line-height:1.3;">Millions of UK taxpayers may be paying more tax than they need to.</div>
      <div style="font-size:13px;color:#6b6b66;line-height:1.6;margin-bottom:12px;">HMRC data shows 5.6 million people overpaid HMRC <strong style="color:#0f0f0e;">£3.5 billion</strong> in income tax in 2023/24 — an average of £625 among those affected. The pattern repeated in 2024/25, and HMRC is under no duty to tell you.<br>TaxReady gives you a quick estimate — then matches you to the right local accountant to review your situation properly.</div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <div>
          <span style="font-family:'Playfair Display',serif;font-size:clamp(17px,2.5vw,22px);color:#0f0f0e;">5.6m</span>
          <span style="font-size:11px;color:#6b6b66;margin-left:4px;">UK taxpayers overpaid in 2023/24</span>
        </div>
        <div class="proof-stat-extra">
          <span style="font-family:'Playfair Display',serif;font-size:clamp(17px,2.5vw,22px);color:#0f0f0e;">£625</span>
          <span style="font-size:11px;color:#6b6b66;margin-left:4px;">average among those affected</span>
        </div>
        <div class="proof-stat-extra">
          <span style="font-family:'Playfair Display',serif;font-size:clamp(17px,2.5vw,22px);color:#0f0f0e;">£3.5bn</span>
          <span style="font-size:11px;color:#6b6b66;margin-left:4px;">overpaid in total</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:#9b9b96;text-transform:uppercase;letter-spacing:0.06em;">Sources:</span>
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:#9b9b96;letter-spacing:0.04em;">HMRC</span>
        <span style="color:#e8e8e3;">·</span>
        <a href="https://news.sky.com/story/nearly-six-million-people-have-overpaid-tax-13496221" target="_blank" rel="noopener" style="text-decoration:none;"><span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;padding:2px 6px;border-radius:2px;background:#003b6f;color:white;">SKY NEWS</span></a>
        <a href="https://www.thesun.co.uk/money/37929598/hmrc-tax-refund-check/" target="_blank" rel="noopener" style="text-decoration:none;"><span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;padding:2px 6px;border-radius:2px;background:#e8000d;color:white;">THE SUN</span></a>
        <a href="https://www.ft.com/content/2c8d4994-2326-4c0e-8655-000f11fb051b" target="_blank" rel="noopener" style="text-decoration:none;"><span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:2px 6px;border-radius:2px;background:#FFC0CB;color:#0f0f0e;">FT</span></a>
      </div>
      `}
    </div><!-- /seg-proof-strip -->

  </div>

  <!-- ══ MAP SECTION (below hero) ══ -->
  <div class="seg-map-section">
    <div class="hub-map-eyebrow">Accountants found with AI</div>
    <div class="hub-map-label">${COUNTRY === 'au' ? 'Local Australian accountants' : firmCountStr() + ' local UK accountants'} — <em style="font-style:italic;">AI finds your perfect match.</em></div>
    <div style="font-size:14px;color:#6b6b66;line-height:1.6;margin-bottom:28px;">We scan ${firmCountStr()} highly rated local firms and match you to the best one for ${d.eyebrow.replace('For ', '')}. Enter your income above, get your estimate in 30 seconds, then send it to your matched accountant in 1 click.</div>

    <div class="hub-map-grid">

      <!-- Left: map -->
      <div style="display:flex;flex-direction:column;">
        <div style="border-radius:16px;overflow:hidden;border:1.5px solid #e8e8e3;flex:1;min-height:280px;position:relative;margin-bottom:12px;z-index:0;isolation:isolate;">
          <div id="leaflet-seg-${key}" style="width:100%;height:100%;"></div>
          <div onclick="window.scrollTo({top:0,behavior:'smooth'})" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:#0f0f0e;color:white;border-radius:10px;padding:9px 20px;font-family:'IBM Plex Sans',sans-serif;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.2);text-align:center;z-index:1000;">
            Enter your income above to get matched
          </div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#6b6b66;">
            <div style="width:10px;height:10px;background:#86efac;border:1.5px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15);flex-shrink:0;"></div>4+ stars
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#6b6b66;">
            <div style="width:10px;height:10px;background:#fdba74;border:1.5px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15);flex-shrink:0;"></div>3+ stars
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#6b6b66;">
            <div style="width:10px;height:10px;background:#fca5a5;border:1.5px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15);flex-shrink:0;"></div>Under 3 stars
          </div>
        </div>
      </div>

      <!-- Right: segment-specific firm cards -->
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${d.accountants.map(a => `
          <div onclick="window.scrollTo({top:0,behavior:'smooth'})" style="background:white;border:1.5px solid #e8e8e3;border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.borderColor='#0f0f0e';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='#e8e8e3';this.style.transform=''">
            <div style="min-width:0;flex:1;">
              <div style="font-size:14px;font-weight:600;color:#0f0f0e;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                <span style="width:6px;height:6px;background:#86efac;border-radius:50%;flex-shrink:0;display:inline-block;"></span>${a.name}
              </div>
              <div style="font-size:11px;color:#6b6b66;display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px;">
                <span>📍 ${a.loc}</span>
                <span style="font-family:'DM Mono',monospace;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 7px;">${d.accountants[0].spec}</span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="color:#f5c842;font-size:12px;letter-spacing:1px;margin-bottom:2px;">★★★★★</div>
              <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:#0f0f0e;">${a.rating}</div>
              <div style="font-size:9px;color:#6b6b66;">${a.reviews} reviews</div>
            </div>
          </div>`).join('')}
        <div style="font-size:12px;color:#6b6b66;padding:8px 0 4px;">+ ${allFirms.length > 0 ? (allFirms.length - 4).toLocaleString() : (COUNTRY === 'au' ? '0' : '2,496')} more across ${COUNTRY_NAME} · <span onclick="window.scrollTo({top:0,behavior:'smooth'})" style="color:#00B1B2;cursor:pointer;font-weight:500;">Enter your income above →</span></div>
      </div>

    </div>
  </div>

  <!-- ══ RESULTS ══ -->
  <div class="results-wrap" style="display:none">
    <div class="results-inner">

      <!-- Overpay banner — seeded with stat -->
      <div class="overpay-banner">
        <div class="ob-icon">⚠️</div>
        <div class="ob-body">
          <div class="ob-title">Many people pay more than they need to.</div>
          <div class="ob-sub">${COUNTRY === 'au' ? 'ATO data shows millions of Australians miss out on legitimate deductions each year. See your estimate below, then get matched with an accountant to review it properly.' : 'HMRC data shows 5.6 million UK taxpayers overpaid in 2023/24 — and HMRC is under no duty to tell them. See your estimate below, then get matched with an accountant to review it properly.'}</div>
        </div>
      </div>

      <!-- Estimate -->
      <div class="est-header">
        <div class="est-label">Your rough 2025/26 tax estimate</div>
        <div class="est-amount res-amount">${CURRENCY}0</div>
        <div class="est-note">Rough estimate based on ${COUNTRY === 'au' ? '2025-26 Australian' : '2025/26 UK'} rates · Actual bill depends on your exact income, expenses and allowances · Not financial or tax advice · <a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener" style="color:var(--muted)">full disclaimer</a></div>
        <div class="eff-tag"><span class="eff-rate">0%</span>&nbsp;effective rate</div>
      </div>

      <!-- Chart -->
      <div class="chart-area">
        <div class="chart-wrap">
          <canvas class="tax-chart" width="130" height="130"></canvas>
          <div class="chart-center">
            <div class="chart-pct eff-rate-chart">0%</div>
            <div class="chart-pct-label">effective<br>rate</div>
          </div>
        </div>
        <div class="chart-legend leg-wrap"></div>
      </div>

      <!-- Expense explorer -->
      <div class="exp-section">
        <div class="exp-section-title">How your bill changes by what you claim.</div>
        <div class="exp-section-sub">Rough estimates tailored for <strong>${d.label}</strong> — pick the tier that best matches your situation. Your accountant will confirm the exact figures.</div>

        <!-- Saving hero — shows above tiles, always visible -->
        <div class="saving-hero">
          <div class="sh-label">Estimated saving vs no claims</div>
          <div class="sh-amount saving-amount-display" style="color:var(--teal)">${CURRENCY}0</div>

        </div>

        <div class="tier-cards">
          ${d.tiers.map((t,i)=>`
          <div class="tier-card tier-${i}" onclick="setTier(this,'${key}',${t.totalDeduction},${t.pensionAmount})">
            <div class="tc-name">${t.name}</div>
            <div class="tc-desc">${t.desc}</div>
            <div class="tc-bill-label">Tax bill</div>
            <div class="tc-amount tc-amt-${i}">${CURRENCY}—</div>
            <div class="tc-save tc-save-${i}">—</div>
            <div class="tc-tags">${t.tags.map(tag=>`<span class="tc-tag">${tag}</span>`).join('')}</div>
          </div>`).join('')}
        </div>
        <div class="tier-disclaimer">Rough estimates based on typical claims for your work type — actual figures will depend on your exact situation. Your accountant will confirm.</div>

        <!-- File with accountant CTA — after chips -->
        <div class="file-acct-cta" onclick="scrollToAcct('${key}')">
          <div class="fac-left">
            <div class="fac-title acct-dynamic-saving">Find a local accountant near you</div>
            <div class="fac-sub">AI-matched to your work type · ${firmCountStr()} rated local firms</div>
          </div>
          <div class="fac-arrow">↓</div>
        </div>
      </div>

      <!-- Breakdown (collapsible) -->
      <div class="breakdown-wrap">
        <button class="breakdown-toggle" onclick="toggleBreakdown(this)">
          <svg class="bd-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          See full tax breakdown
        </button>
        <div class="breakdown-body" style="display:none">
          <div class="breakdown">
            <div class="br-row"><span class="br-label">Gross income</span><span class="br-val credit b-income">—</span></div>
            <div class="br-row"><span class="br-label">Allowable expenses</span><span class="br-val deduct b-expenses">—</span></div>
            <div class="br-row b-pension-row" style="display:none"><span class="br-label">Pension contributions</span><span class="br-val deduct b-pension">—</span></div>
            <div class="br-row b-pa-row"><span class="br-label b-pa-label">Personal allowance</span><span class="br-val deduct b-pa-val">—</span></div>
            <div class="br-row"><span class="br-label">Taxable income</span><span class="br-val b-taxable">—</span></div>
            <div class="br-row"><span class="br-label">Income tax</span><span class="br-val b-tax">—</span></div>
            <div class="br-row"><span class="br-label b-ni-label">National Insurance (Class 4)</span><span class="br-val b-ni">—</span></div>
            <div class="br-row"><span class="br-label" style="color:var(--text);font-weight:600">Total owed</span><span class="br-val total-val b-total">—</span></div>
          </div>
        </div>
      </div>

      <!-- Accountant section -->
      <div class="acct-finder" id="acct-finder-${key}">
        <div class="acct-hook-title acct-hook-title-el">Put in your postcode — see your top 3 AI-matched local accountants.</div>
        <div class="acct-saving-callout acct-saving-callout-text">Based on your income and work type, our AI has shortlisted your top 3 local specialists. All highly rated, all matched to your specific situation — enter your postcode to see yours.</div>

        <!-- Results map -->
        <div class="results-map-box" style="height:320px;margin-bottom:18px">
          <div id="leaflet-results-${key}" style="width:100%;height:100%;"></div>
        </div>

        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);">
            <div style="width:14px;height:14px;background:#22c55e;border:1.5px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:black;font-size:9px;line-height:1;">★</div>
            AI recommendation
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);">
            <div style="width:10px;height:10px;background:#86efac;border:1.5px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15);flex-shrink:0;"></div>
            4+ stars
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);">
            <div style="width:10px;height:10px;background:#fdba74;border:1.5px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15);flex-shrink:0;"></div>
            3+ stars
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);">
            <div style="width:10px;height:10px;background:#fca5a5;border:1.5px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15);flex-shrink:0;"></div>
            Under 3 stars
          </div>
        </div>

        <div class="pc-wrap">
          <div class="pc-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b6b66" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <input type="text" class="pc-input" id="results-postcode-${key}" placeholder="Enter postcode — see your AI-matched top 3" onkeydown="if(event.key==='Enter')searchResultsPostcode('${key}')">
          <button class="pc-btn" onclick="searchResultsPostcode('${key}')">Get my matches</button>
        </div>

        <div class="acc-list" id="acc-list-${key}">
          <div style="font-size:13px;color:var(--muted);padding:8px 0;">Loading accountants…</div>
        </div>
        <div class="err-box2" id="err-acc-${key}"></div>
      </div>

      <!-- Send form — appears on card select -->
      <div class="send-form">
        <div class="sf-chosen">
          <div class="sf-chosen-check">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00B1B2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <div class="sf-firm-name">—</div>
            <div class="sf-firm-detail">—</div>
          </div>
          <div class="sf-change" onclick="clearAccSel('${key}')">Change</div>
        </div>

        <div class="sf-form-title">Send your estimate to your accountant.</div>
        <div class="sf-form-sub">Two quick details and it's on its way. They'll be in touch by email.</div>

        <div class="sf-row">
          <div class="sf-field">
            <label>Your name</label>
            <input type="text" class="sf-input sf-name" placeholder="Alex Turner" autocomplete="name">
          </div>
          <div class="sf-field">
            <label>Email</label>
            <input type="email" class="sf-input sf-email" placeholder="alex@yourcompany.co.uk" autocomplete="email">
          </div>
        </div>
        <div class="sf-field">
          <label>How do you trade? <span class="sf-opt">helps your accountant prepare</span></label>
          <select class="sf-input sf-biz-structure">
            <option value="">Select…</option>
            <option value="Sole trader / self-employed">Sole trader / self-employed</option>
            <option value="Limited company (director)">Limited company (director)</option>
            <option value="Partnership">Partnership</option>
            <option value="PAYE / employed">PAYE / employed</option>
            <option value="Landlord">Landlord</option>
            <option value="Not sure">Not sure</option>
          </select>
        </div>
        <div class="sf-field">
          <label>Anything your accountant should know <span class="sf-opt">optional</span></label>
          <textarea class="notes-field" placeholder="${d.notesPH}"></textarea>
        </div>

        <!-- Security inline (not in grey box) -->
        <div class="security-inline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00B1B2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Securely handled, and shared with your chosen accountant via <a href="https://www.workiro.com/" target="_blank" rel="noopener" class="workiro-inline">Workiro</a> — document management trusted by 65,000+ professionals.</span>
        </div>

        <div class="sf-err" id="sf-err-${key}"></div>
        <button class="black-btn send-btn" onclick="doSend(this,'${key}')">Send this to my accountant →</button>
        <div class="send-hint">No sign-up required. Results may vary — see our <a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">terms</a>.</div>
      </div>

      <div style="text-align:center;margin-top:32px">
        <span class="back-lnk" onclick="backToHero('${key}')">← Change my income</span>
        &nbsp;&nbsp;<span class="back-lnk" onclick="showHub()">← Back to main page</span>
      </div>
    </div>
  </div>

  <!-- ══ SUCCESS ══ -->
  <div class="success-wrap" style="display:none">
    <div class="success-icon">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#00B1B2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h2>Done. <span class="g-text success-firm-name" style="font-family:'Playfair Display',serif;font-style:italic;">Your accountant</span> is on it.</h2>
    <p class="success-sub">Your income details and selected expense tier have been sent securely to your chosen accountant. They'll be in touch by email to take it from here.</p>

    <div class="success-summary">
      <div class="ss-row"><span class="ss-label">Income you provided</span><span class="ss-value success-amount">—</span></div>
      <div class="ss-row"><span class="ss-label">Expense tier selected</span><span class="ss-value success-expenses">—</span></div>
      <div class="ss-row"><span class="ss-label">Sent to</span><span class="ss-value success-firm-list">—</span></div>
    </div>
    <div style="font-size:11px;color:var(--muted);font-style:italic;margin-bottom:20px;text-align:center;">This is a rough estimate only — your accountant will confirm the exact figures based on your full situation.</div>

    <!-- Share section -->
    <div class="share-clean">
      <div class="share-clean-title">You might have saved <span class="share-saving-fig">up to ${COUNTRY === 'au' ? 'A$2,800' : '£625'}</span> — know someone who might be overpaying?</div>
      <div class="share-clean-sub">Most people miss out on hundreds in tax relief. Share this with someone who could benefit too.</div>

      <a class="share-wa-btn" id="wa-share-${key}" href="#" target="_blank" rel="noopener">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.998 2C6.473 2 2 6.473 2 12c0 1.99.58 3.843 1.58 5.403L2.065 22l4.734-1.538C8.22 21.434 10.07 22 11.998 22 17.523 22 22 17.527 22 12S17.523 2 11.998 2z" fill="white" opacity=".25"/></svg>
        Send via WhatsApp
      </a>

      <div class="share-sec-row">
        <span style="font-size:12px;color:var(--muted);">Or copy the link and share it your way —</span>
        <button class="share-sec-link share-copy-inline" id="copy-link-${key}" onclick="copyShareLinkSimple(this,'${key}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy link
        </button>
        <span class="share-copied-msg" id="copy-confirm-${key}">✓ Copied</span>
      </div>
    </div>

    <!-- Bottom CTAs -->
    <div class="success-ctas">

      <!-- CTA 1: Making Tax Digital (hidden for now — re-enable when needed)
      <div class="mtd-cta-block">
        <span class="mtd-cta-badge">Hot topic right now</span>
        <div class="mtd-cta-eyebrow">Making Tax Digital · MTD for ITSA</div>
        <div class="mtd-cta-title">Does Making Tax Digital apply to you? Find out free — in 10 seconds.</div>
        <div class="mtd-cta-body">MTD for Income Tax Self Assessment is rolling out now. Millions of sole traders and landlords will be affected — many don't even know yet. We've built a free tool to check your position and tell you exactly what you need to do.</div>
        <div class="mtd-cta-pills">
          <span class="mtd-cta-pill">✅ Free to use</span>
          <span class="mtd-cta-pill">⏱ 10 seconds</span>
          <span class="mtd-cta-pill">📋 Plain English result</span>
          <span class="mtd-cta-pill">🧾 Accountants: generate white-label reports for clients</span>
        </div>
        <div class="mtd-cta-links">
          <a class="mtd-cta-primary" href="https://www.mtdready.com/" target="_blank" rel="noopener">Check my MTD position free →</a>
          <span class="mtd-cta-secondary">No sign-up · Instant result</span>
        </div>
      </div>
      -->

      <!-- CTA 2: Workiro for regulated industries -->
      <div class="workiro-cta-block">
        <span class="workiro-cta-heart">❤️</span>
        <div class="workiro-cta-eyebrow">TaxReady is built by Workiro</div>
        <div class="workiro-cta-title">The tool you just used? We built it because messy paperwork costs people real money.</div>
        <div class="workiro-cta-body">Workiro is used by 65,000+ professionals in regulated industries to manage documents, communicate with clients, and stay compliant — without the chaos. If your work involves sensitive documents and compliance, it's worth a look.</div>
        <div class="workiro-cta-industries">
          <span class="workiro-cta-ind workiro-cta-ind-a">Accounting</span>
          <span class="workiro-cta-ind workiro-cta-ind-b">Bookkeeping</span>
          <span class="workiro-cta-ind workiro-cta-ind-c">Wealth management</span>
          <span class="workiro-cta-ind workiro-cta-ind-d">Insolvency</span>
          <span class="workiro-cta-ind workiro-cta-ind-e">Financial planning</span>
          <span class="workiro-cta-ind workiro-cta-ind-a">Legal</span>
          <span class="workiro-cta-ind workiro-cta-ind-b">Consultancy</span>
          <span class="workiro-cta-ind workiro-cta-ind-c">Property</span>
          <span class="workiro-cta-ind workiro-cta-ind-d">HR & compliance</span>
          <span class="workiro-cta-ind workiro-cta-ind-e">Mortgage broking</span>
          <span class="workiro-cta-ind workiro-cta-ind-a">Insurance</span>
          <span class="workiro-cta-ind workiro-cta-ind-b">Pension advisory</span>
          <span class="workiro-cta-ind workiro-cta-ind-c">Tax advisory</span>
          <span class="workiro-cta-ind workiro-cta-ind-d">Corporate finance</span>
        </div>
        <a class="workiro-cta-link" href="https://www.workiro.com/" target="_blank" rel="noopener">Learn more about Workiro →</a>
      </div>

      <!-- CTA 3: Accountant/bookkeeper listing -->
      <div class="acct-list-cta-block">
        <div class="alc-eyebrow">👋 Are you an accountant or bookkeeper?</div>
        <div class="alc-title">The clients you want are already using this tool.</div>
        <div class="alc-body">TaxReady users are actively looking for a local specialist — right now. We already have your location and ratings in our system. Add your certifications, fee range and specialisms below and our AI will rank you higher in front of the right clients.</div>
        <div class="alc-tags" style="margin-bottom:16px;">
          <span class="alc-tag">🤖 AI-matched to your specialisms</span>
          <span class="alc-tag">🏆 Certifications on your card</span>
          <span class="alc-tag">💷 Fee range shown to clients</span>
          <span class="alc-tag">🎯 More relevant leads</span>
          <span class="alc-tag">📍 Local first</span>
        </div>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.5;">The more you add, the more the AI can match you to the right clients.</p>
        <a class="alc-link" href="accountants.html" target="_blank" rel="noopener" style="display:inline-block;background:#0f0f0e;color:white;border-radius:8px;padding:12px 24px;font-size:13px;font-weight:600;font-family:'IBM Plex Sans',sans-serif;text-decoration:none;letter-spacing:0.01em;">Enhance your profile →</a>
      </div>

    </div>

    <div style="margin-top:40px;padding-top:28px;border-top:1px solid var(--border);text-align:center;">
      <span class="start-over" onclick="showHub()">← Start a new estimate</span>
    </div>
  </div>
  `;

  return page;
}

// ─── TAX CALC — 2025/26 RATES ────────────────────────────────────────────
// Income tax bands (England/Wales/NI):
//   Personal allowance: £12,570 (tapers £1 per £2 above £100k)
//   Basic rate 20%: £0–£37,700 taxable
//   Higher rate 40%: £37,700–£125,140 taxable (effectively 0 PA at £125,140)
//   Additional rate 45%: above £125,140 taxable
// Class 4 NI (self-employed, 2025/26):
//   6% on profits £12,570–£50,270 (reduced from 9% in April 2024)
//   2% on profits above £50,270
//   Class 2 NI abolished April 2024

function calcTax(income, exp) {
  const net = Math.max(0, income - exp);

  // Personal allowance taper (£1 reduction per £2 above £100k)
  let pa = 12570;
  if (net > 100000) pa = Math.max(0, 12570 - Math.floor((net - 100000) / 2));

  const taxable = Math.max(0, net - pa);

  // Income tax
  let tax = 0;
  const brBand = 37700;
  const hrBand = Math.max(0, (pa < 12570 ? 125140 - pa : 125140 - pa) - brBand);
  if (taxable <= brBand) {
    tax = taxable * 0.20;
  } else if (taxable <= brBand + hrBand) {
    tax = brBand * 0.20 + (taxable - brBand) * 0.40;
  } else {
    tax = brBand * 0.20 + hrBand * 0.40 + (taxable - brBand - hrBand) * 0.45;
  }

  // Class 4 NI (self-employed, 2025/26 rates: 6% / 2%)
  let ni = 0;
  if (net > 12570) {
    ni += (Math.min(net, 50270) - 12570) * 0.06;
    if (net > 50270) ni += (net - 50270) * 0.02;
  }

  const total = tax + ni;
  const keep = net - total;
  return { income, exp, net, taxable, tax, ni, total, keep, pa };
}

// ─── TAX CALC — AUS 2024-25 RATES ────────────────────────────────────────
// Bands (post Stage 3 tax cuts):
//   $0–$18,200: 0% (tax-free threshold)
//   $18,201–$45,000: 19%
//   $45,001–$120,000: 32.5%
//   $120,001–$180,000: 37%
//   $180,001+: 45%
// LITO: $700 offset, phases out $37,500–$66,667
// Medicare Levy: 2% (simplified threshold ~$26,000)

function calcTaxAU(income, exp) {
  const net = Math.max(0, income - exp);

  let tax = 0;
  if (net <= 18200)       tax = 0;
  else if (net <= 45000)  tax = (net - 18200) * 0.19;
  else if (net <= 120000) tax = 5092 + (net - 45000) * 0.325;
  else if (net <= 180000) tax = 29467 + (net - 120000) * 0.37;
  else                    tax = 51667 + (net - 180000) * 0.45;

  // Low Income Tax Offset
  let lito = 0;
  if      (net <= 37500) lito = 700;
  else if (net <= 45000) lito = 700  - (net - 37500) * 0.05;
  else if (net <= 66667) lito = 325  - (net - 45000) * 0.015;
  tax = Math.max(0, tax - lito);

  const medicare = net > 26000 ? net * 0.02 : 0;
  const total = tax + medicare;
  const keep = net - total;
  return { income, exp, net, taxable: Math.max(0, net - 18200), tax, ni: medicare, total, keep, pa: 18200 };
}

// Route to correct calc function based on active country
function calcTaxForCountry(income, exp) {
  return COUNTRY === 'au' ? calcTaxAU(income, exp) : calcTax(income, exp);
}

// ─── CALCULATE ───────────────────────────────────────────────────────────
function doCalc(key) {
  const page = document.getElementById('seg-'+key);
  const income = parseFloat(page.querySelector('.inc-input').value) || 0;
  const err = document.getElementById('err-'+key);
  if (income <= 0) { err.textContent = 'Please enter your income to get your estimate.'; err.style.display = 'block'; return; }
  err.style.display = 'none';

  page._income = income;
  const d = SEGMENTS[key];
  // Default: tier 1 (middle/typical tier) selected
  page._expenses = d.tiers[1].totalDeduction;
  page._pensionAmount = d.tiers[1].pensionAmount;

  // Populate tier card amounts
  const r0 = calcTaxForCountry(income, 0); // baseline for savings calc
  d.tiers.forEach((t, i) => {
    const r = calcTaxForCountry(income, t.totalDeduction);
    const amtEl = page.querySelector('.tc-amt-' + i);
    const saveEl = page.querySelector('.tc-save-' + i);
    if (amtEl) amtEl.textContent = fmt(r.total);
    if (saveEl) {
      const saved = r0.total - r.total;
      saveEl.textContent = saved > 0 ? 'Save ' + fmt(saved) : 'Baseline';
    }
  });

  // Select typical tier by default
  page.querySelectorAll('.tier-card').forEach(t => t.classList.remove('selected'));
  const defaultTile = page.querySelector('.tier-1');
  if (defaultTile) defaultTile.classList.add('selected');

  updateLiveTax(key);

  page.querySelector('.seg-hero-wrap').style.display = 'none';
  page.querySelector('.seg-map-section').style.display = 'none';
  page.querySelector('.results-wrap').style.display = 'block';
  setTimeout(() => initResultsMap(key), 0);
  window.scrollTo({top:0, behavior:'smooth'});
}

// ─── LIVE TAX UPDATE ─────────────────────────────────────────────────────
function updateLiveTax(key) {
  const page = document.getElementById('seg-'+key);
  const income = page._income || 0;
  const exp = page._expenses || 0;
  const pension = page._pensionAmount || 0;
  const pureExp = Math.max(0, exp - pension);
  const r = calcTaxForCountry(income, exp);
  const r0 = calcTaxForCountry(income, 0);         // always the baseline

  // Saving vs no expenses baseline
  const savingVsBaseline = Math.max(0, r0.total - r.total);
  // Always show actual saving vs baseline (£0 when no expenses selected)
  const displaySaving = savingVsBaseline;

  // Animate big number
  const amountEl = page.querySelector('.res-amount');
  amountEl.style.opacity = '0.5';
  amountEl.style.transform = 'translateY(-4px)';
  setTimeout(() => {
    amountEl.textContent = fmt(r.total);
    amountEl.style.opacity = '1';
    amountEl.style.transform = 'translateY(0)';
    amountEl.style.transition = 'all 0.25s';
  }, 120);

  const effPct = income > 0 ? ((r.total/income)*100).toFixed(1)+'%' : '0%';
  page.querySelectorAll('.eff-rate').forEach(el => el.textContent = effPct);
  const erc = page.querySelector('.eff-rate-chart');
  if (erc) erc.textContent = effPct;

  // Breakdown
  page.querySelector('.b-income').textContent = fmt(r.income);
  page.querySelector('.b-expenses').textContent = pureExp > 0 ? '−'+fmt(pureExp) : CURRENCY+'0';
  const pensionEl = page.querySelector('.b-pension');
  const pensionRow = page.querySelector('.b-pension-row');
  if (pensionEl && pensionRow) {
    if (pension > 0) { pensionEl.textContent = '−'+fmt(pension); pensionRow.style.display = ''; }
    else { pensionRow.style.display = 'none'; }
  }
  // Personal allowance row — label and value differ by country
  const paLabelEl = page.querySelector('.b-pa-label');
  const paValEl   = page.querySelector('.b-pa-val');
  if (paLabelEl) paLabelEl.textContent = COUNTRY === 'au' ? 'Tax-free threshold' : 'Personal allowance';
  if (paValEl)   paValEl.textContent   = '−' + fmt(r.pa);
  // NI / Medicare label
  const niLabelEl = page.querySelector('.b-ni-label');
  if (niLabelEl) niLabelEl.textContent = COUNTRY === 'au' ? 'Medicare levy' : 'National Insurance (Class 4)';

  page.querySelector('.b-taxable').textContent = fmt(r.taxable);
  page.querySelector('.b-tax').textContent = fmt(r.tax);
  page.querySelector('.b-ni').textContent = fmt(r.ni);
  page.querySelector('.b-total').textContent = fmt(r.total);

  // Saving hero — always visible, text adapts
  const sh = page.querySelector('.saving-hero');
  const sad = page.querySelector('.saving-amount-display');
  sh.style.display = 'block';
  sad.textContent = fmt(displaySaving);

  // Update file-with-accountant CTA with saving
  const facTitle = page.querySelector('.acct-dynamic-saving');
  const segLabel = (SEGMENTS[key]?.label || '').toLowerCase();
  if (facTitle) {
    facTitle.textContent = savingVsBaseline > 100
      ? `Find a local accountant — save up to ${fmt(savingVsBaseline)}`
      : 'Find a local accountant near you';
  }
  // Update accountant section heading with saving figure
  const acctHeading = page.querySelector('.acct-hook-title-el');
  if (acctHeading) {
    if (savingVsBaseline > 100) {
      acctHeading.textContent = `Put in your postcode — see your AI-matched local accountants and up to ${fmt(savingVsBaseline)} in potential savings.`;
    } else {
      acctHeading.textContent = 'Put in your postcode — see your top 3 AI-matched local accountants.';
    }
  }

  // Dynamic accountant section sub
  const calloutEl = page.querySelector('.acct-saving-callout-text');
  if (calloutEl) {
    calloutEl.innerHTML = `AI-shortlisted from ${firmCountStr()} firms for your work type — your top 3 ${segLabel} specialists, all local, all highly rated. Enter your postcode to see yours.`;
  }

  updateChart(key, r);
}

// ─── CHART ───────────────────────────────────────────────────────────────
function updateChart(key, r) {
  const page = document.getElementById('seg-'+key);
  const canvas = page.querySelector('.tax-chart');
  if (!canvas) return;
  if (chartInsts[key]) chartInsts[key].destroy();
  const colours = ['#E77481','#7E49E7','#0f0f0e'];
  const labels = ['Tax & NI','Expenses','Take-home'];
  const values = [r.total, r.exp, r.keep];
  chartInsts[key] = new Chart(canvas.getContext('2d'), {
    type:'doughnut',
    data:{ labels, datasets:[{ data:values, backgroundColor:colours, borderWidth:0, hoverOffset:5 }] },
    options:{ cutout:'70%', plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmt(c.parsed)}} }, animation:{duration:300} }
  });
  page.querySelector('.leg-wrap').innerHTML = labels.map((l,i)=>`
    <div class="leg-item">
      <div class="leg-swatch" style="background:${colours[i]}"></div>
      <div><div class="leg-name">${l}</div><div class="leg-val">${fmt(values[i])}</div></div>
    </div>`).join('');
}

// ─── TIER SELECTION ───────────────────────────────────────────────────────
function setTier(el, key, deduction, pensionAmount) {
  const page = document.getElementById('seg-'+key);
  page._expenses = deduction;
  page._pensionAmount = pensionAmount;
  page.querySelectorAll('.tier-card').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
  updateLiveTax(key);
}

// ─── SCROLL TO ACCOUNTANT SECTION ────────────────────────────────────────
function scrollToAcct(key) {
  const el = document.getElementById('acct-finder-'+key);
  if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
}

// ─── BREAKDOWN TOGGLE ────────────────────────────────────────────────────
function toggleBreakdown(btn) {
  btn.classList.toggle('open');
  const body = btn.nextElementSibling;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

// ─── PICK ACCOUNTANT ─────────────────────────────────────────────────────
function pickCard(el, firm, detail, key) {
  document.querySelectorAll('.acc-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const firmKey = firm + '|' + detail;
  highlightResultsMarker(key, firmKey);
  selFirm = firm; selDetail = detail;

  // Pan results map to selected firm and open its popup
  const firmData = allFirms.find(f => f.name === firm && f.city === detail);
  if (firmData && resultsMaps[key]) {
    resultsMaps[key].setView([firmData.lat, firmData.lng], 13);
    const m = resultsMarkers[key]?.[firmKey];
    if (m) setTimeout(() => m.openPopup(), 300);
  }

  const page = document.getElementById('seg-'+key);
  const form = page.querySelector('.send-form');
  form.querySelector('.sf-firm-name').textContent = firm;
  form.querySelector('.sf-firm-detail').textContent = detail;
  form.style.display = 'block';
  const errAcc = document.getElementById('err-acc-'+key);
  if (errAcc) errAcc.style.display = 'none';
  setTimeout(() => form.scrollIntoView({behavior:'smooth', block:'start'}), 80);
}

function clearAccSel(key) {
  selFirm = null; selDetail = null;
  highlightResultsMarker(key, null);
  const page = document.getElementById('seg-'+key);
  document.querySelectorAll('.acc-card').forEach(c => c.classList.remove('selected'));
  page.querySelector('.send-form').style.display = 'none';
  page.querySelector('.acct-finder').scrollIntoView({behavior:'smooth', block:'start'});
}

// ─── SEND ─────────────────────────────────────────────────────────────────
function doSend(btn, key) {
  const page = document.getElementById('seg-'+key);
  const name = page.querySelector('.sf-name').value.trim();
  const email = page.querySelector('.sf-email').value.trim();
  const bizStructure = (page.querySelector('.sf-biz-structure')?.value || '').trim();
  const notes = (page.querySelector('.notes-field')?.value || '').trim();
  const selectedTile = page.querySelector('.tier-card.selected');
  const expLabels = selectedTile ? (selectedTile.querySelector('.tc-name')?.textContent + ' tier') : 'Typical tier';
  const sfErr = document.getElementById('sf-err-'+key);
  if (!name || !email) { sfErr.textContent = 'Please enter your name and email to continue.'; sfErr.style.display = 'block'; return; }
  sfErr.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Sending securely…';

  const income = page._income || 0;
  const exp = page._expenses || 0;
  const server = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'test' : 'live';
  fetch(SUBMISSIONS_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify({ server, name, email, income, bizStructure, expenses: expLabels, notes, firm: selFirm || '', trade: key }),
  }).catch(() => {});
  const r = calcTax(income, exp);
  const r0 = calcTax(income, 0);
  const saving = r0.total - r.total;
  const d = SEGMENTS[key];

  // Build personalised share text. Only attribute a £ saving to the user if
  // we actually calculated one — otherwise fall back to generic copy.
  const hasSaving = saving > 50;
  const savingStr = hasSaving ? fmt(saving) : null;
  const shareMsg = hasSaving
    ? `I just checked my 2025/26 UK tax on TaxReady and could save ${savingStr} by claiming allowable expenses.\n\n5.6 million UK workers overpaid HMRC in 2023/24 — and HMRC is under no duty to tell you. Check yours in 30 seconds, free:\n\nhttps://taxready.me`
    : `I just checked my 2025/26 UK tax on TaxReady in 30 seconds — free, no sign-up.\n\n5.6 million UK workers overpaid HMRC in 2023/24 — and HMRC is under no duty to tell you. Worth a look:\n\nhttps://taxready.me`;

  setTimeout(() => {
    page.querySelector('.results-wrap').style.display = 'none';
    const sw = page.querySelector('.success-wrap');

    sw.querySelector('.success-firm-name').textContent = selFirm || 'Your accountant';
    sw.querySelector('.success-amount').textContent = income > 0 ? fmt(income) : '—';
    sw.querySelector('.success-expenses').textContent = expLabels;
    sw.querySelector('.success-firm-list').textContent = selFirm || '—';

    // Saving inline in mission copy
    const ssi = sw.querySelector('.success-saving-inline');
    if (ssi && saving > 50) ssi.textContent = fmt(saving) + ' of it';

    // Update share saving figure. Only show a £ figure if we actually
    // calculated one — otherwise rephrase so we don't attribute the
    // £625 overpayment average to the user as their personal saving.
    const savingFigEl = sw.querySelector('.share-saving-fig');
    const shareTitleEl = sw.querySelector('.share-clean-title');
    if (hasSaving && savingFigEl) {
      savingFigEl.textContent = savingStr;
    } else if (shareTitleEl) {
      shareTitleEl.textContent = 'Know someone who might be overpaying HMRC?';
    }

    // Wire up share links
    const waEl = sw.querySelector('#wa-share-'+key);
    const smsEl = sw.querySelector('#sms-share-'+key);
    const emailEl = sw.querySelector('#email-share-'+key);
    if (waEl) waEl.href = 'https://wa.me/?text=' + encodeURIComponent(shareMsg);
    if (smsEl) smsEl.href = 'sms:?body=' + encodeURIComponent(shareMsg);
    if (emailEl) emailEl.href = 'mailto:?subject=Check%20your%20UK%20tax%20bill%20for%20free&body=' + encodeURIComponent(shareMsg);

    sw.style.display = 'block';
    window.scrollTo({top:0, behavior:'smooth'});
  }, 1800);
}

// ─── COPY SHARE LINK ─────────────────────────────────────────────────────────
function copyShareLinkSimple(btn, key) {
  const d = SEGMENTS[key];
  const page = document.getElementById('seg-'+key);
  const income = page ? (page._income || 0) : 0;
  const exp = page ? (page._expenses || 0) : 0;
  const r0 = income > 0 ? calcTax(income, 0) : null;
  const r = income > 0 ? calcTax(income, exp) : null;
  const saving = r0 && r ? Math.max(0, r0.total - r.total) : 0;
  const hasSaving = saving > 100;
  const shareText = hasSaving
    ? `I just checked my 2025/26 UK tax — free, 30 seconds, no sign-up. Could be saving up to ${fmt(saving)} by claiming allowable expenses:\n\nhttps://taxready.me`
    : `I just checked my 2025/26 UK tax — free, 30 seconds, no sign-up. 5.6m UK workers overpaid HMRC in 2023/24. Worth checking yours:\n\nhttps://taxready.me`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareText).then(() => {
      btn.textContent = 'Copied ✓';
      const confirm = document.getElementById('copy-confirm-'+key);
      if (confirm) { confirm.style.display = 'block'; }
      setTimeout(() => {
        btn.textContent = 'Copy link to share →';
        if (confirm) confirm.style.display = 'none';
      }, 3000);
    }).catch(() => {
      // Fallback: select a temp textarea
      const ta = document.createElement('textarea');
      ta.value = shareText; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = 'Copy link to share →'; }, 3000);
    });
  }
}

// ─── BACK TO HERO ─────────────────────────────────────────────────────────
function backToHero(key) {
  const page = document.getElementById('seg-'+key);
  page.querySelector('.results-wrap').style.display = 'none';
  page.querySelector('.seg-hero-wrap').style.display = 'block';
  page.querySelector('.seg-map-section').style.display = 'block';
  window.scrollTo({top:0, behavior:'smooth'});
}
