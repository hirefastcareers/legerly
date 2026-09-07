/**
 * HMRC Self Assessment SA103F/SA103S expense box mappings.
 * These buckets are statutory and not user-editable.
 */

export const HMRC_CATEGORIES = {
  office_costs: {
    key: "office_costs",
    label: "Office costs",
    sa103Box: "Box 17",
    description: "Stationery, phone bills, broadband, software SaaS",
    deductible: true,
  },
  travel_vehicle: {
    key: "travel_vehicle",
    label: "Travel & vehicle costs",
    sa103Box: "Box 20 / 21",
    description: "Fuel, parking, train fares, simplified mileage",
    deductible: true,
  },
  premises: {
    key: "premises",
    label: "Premises costs",
    sa103Box: "Box 16",
    description: "Rent, light, heat, power, home office use",
    deductible: true,
  },
  maintenance: {
    key: "maintenance",
    label: "Maintenance and repairs",
    sa103Box: "Box 18",
    description: "Repairs and maintenance of business premises/equipment",
    deductible: true,
  },
  advertising: {
    key: "advertising",
    label: "Advertising, marketing & subscriptions",
    sa103Box: "Box 19",
    description: "Marketing, ads, professional subscriptions",
    deductible: true,
  },
  professional_fees: {
    key: "professional_fees",
    label: "Legal, professional & financial fees",
    sa103Box: "Box 22 / 23",
    description: "Accountancy, bank charges, loan interest",
    deductible: true,
  },
  cost_of_goods: {
    key: "cost_of_goods",
    label: "Cost of goods sold",
    sa103Box: "Box 15",
    description: "Raw materials, items for resale",
    deductible: true,
  },
  staff_costs: {
    key: "staff_costs",
    label: "Staff & subcontractor costs",
    sa103Box: "Box 14 / 24",
    description: "Wages, subcontractors, employer NI",
    deductible: true,
  },
  capital_allowances: {
    key: "capital_allowances",
    label: "Capital Allowances (AIA)",
    sa103Box: "Box 28–31",
    description: "Computers, equipment, machinery under Annual Investment Allowance",
    deductible: true,
  },
  non_deductible: {
    key: "non_deductible",
    label: "Non-deductible / Personal",
    sa103Box: "N/A",
    description: "Explicitly excluded from Self Assessment deductions",
    deductible: false,
  },
  income: {
    key: "income",
    label: "Business income / turnover",
    sa103Box: "Box 9 / 10",
    description: "Turnover and other business income",
    deductible: false,
  },
} as const;

export type HmrcCategoryKey = keyof typeof HMRC_CATEGORIES;

export const HMRC_CATEGORY_LIST = Object.values(HMRC_CATEGORIES);

export const SYSTEM_RULES: Array<{
  merchantMatch: string;
  matchType: "contains" | "exact";
  hmrcCategory: HmrcCategoryKey;
  businessPercent: number;
  isTaxClaimable: boolean;
  explanation: string;
  priority: number;
}> = [
  { merchantMatch: "Adobe", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Creative software SaaS", priority: 10 },
  { merchantMatch: "AWS", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Cloud hosting", priority: 10 },
  { merchantMatch: "Amazon Web Services", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Cloud hosting", priority: 10 },
  { merchantMatch: "GitHub", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Developer tools", priority: 10 },
  { merchantMatch: "Microsoft", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Office/software subscription", priority: 20 },
  { merchantMatch: "Google Workspace", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Business productivity suite", priority: 10 },
  { merchantMatch: "Google Cloud", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Cloud services", priority: 10 },
  { merchantMatch: "Vercel", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Hosting platform", priority: 10 },
  { merchantMatch: "Notion", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Productivity SaaS", priority: 10 },
  { merchantMatch: "Slack", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Team communication", priority: 10 },
  { merchantMatch: "Zoom", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Video conferencing", priority: 10 },
  { merchantMatch: "Dropbox", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 100, isTaxClaimable: true, explanation: "Cloud storage", priority: 10 },
  { merchantMatch: "Trainline", matchType: "contains", hmrcCategory: "travel_vehicle", businessPercent: 100, isTaxClaimable: true, explanation: "Rail travel", priority: 10 },
  { merchantMatch: "TfL", matchType: "contains", hmrcCategory: "travel_vehicle", businessPercent: 100, isTaxClaimable: true, explanation: "Public transport", priority: 20 },
  { merchantMatch: "Transport for London", matchType: "contains", hmrcCategory: "travel_vehicle", businessPercent: 100, isTaxClaimable: true, explanation: "Public transport", priority: 10 },
  { merchantMatch: "Uber", matchType: "contains", hmrcCategory: "travel_vehicle", businessPercent: 80, isTaxClaimable: true, explanation: "Business travel (review personal trips)", priority: 30 },
  { merchantMatch: "Shell", matchType: "contains", hmrcCategory: "travel_vehicle", businessPercent: 100, isTaxClaimable: true, explanation: "Fuel", priority: 40 },
  { merchantMatch: "BP ", matchType: "contains", hmrcCategory: "travel_vehicle", businessPercent: 100, isTaxClaimable: true, explanation: "Fuel", priority: 40 },
  { merchantMatch: "NCP", matchType: "contains", hmrcCategory: "travel_vehicle", businessPercent: 100, isTaxClaimable: true, explanation: "Parking", priority: 20 },
  { merchantMatch: "Companies House", matchType: "contains", hmrcCategory: "professional_fees", businessPercent: 100, isTaxClaimable: true, explanation: "Statutory filing fee", priority: 10 },
  { merchantMatch: "HMRC", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Tax payments are not deductible expenses", priority: 5 },
  { merchantMatch: "Costa", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Personal refreshments / entertainment not allowable", priority: 40 },
  { merchantMatch: "Starbucks", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Personal refreshments not allowable", priority: 40 },
  { merchantMatch: "Pret", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Personal food not allowable", priority: 40 },
  { merchantMatch: "Tesco", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Likely personal shopping", priority: 50 },
  { merchantMatch: "Sainsbury", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Likely personal shopping", priority: 50 },
  { merchantMatch: "Netflix", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Personal entertainment", priority: 10 },
  { merchantMatch: "Spotify", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Personal entertainment", priority: 10 },
  { merchantMatch: "LinkedIn", matchType: "contains", hmrcCategory: "advertising", businessPercent: 100, isTaxClaimable: true, explanation: "Professional networking / ads", priority: 20 },
  { merchantMatch: "Facebook Ads", matchType: "contains", hmrcCategory: "advertising", businessPercent: 100, isTaxClaimable: true, explanation: "Advertising", priority: 10 },
  { merchantMatch: "Meta Ads", matchType: "contains", hmrcCategory: "advertising", businessPercent: 100, isTaxClaimable: true, explanation: "Advertising", priority: 10 },
  { merchantMatch: "Google Ads", matchType: "contains", hmrcCategory: "advertising", businessPercent: 100, isTaxClaimable: true, explanation: "Advertising", priority: 10 },
  { merchantMatch: "Apple.com/bill", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 50, isTaxClaimable: true, explanation: "May include business apps — review split", priority: 40 },
  { merchantMatch: "Apple", matchType: "contains", hmrcCategory: "capital_allowances", businessPercent: 100, isTaxClaimable: true, explanation: "Likely hardware — Annual Investment Allowance", priority: 45 },
  { merchantMatch: "TaxAssist", matchType: "contains", hmrcCategory: "professional_fees", businessPercent: 100, isTaxClaimable: true, explanation: "Accountancy fees", priority: 10 },
  { merchantMatch: "Accountants", matchType: "contains", hmrcCategory: "professional_fees", businessPercent: 100, isTaxClaimable: true, explanation: "Professional fees", priority: 40 },
  { merchantMatch: "EE ", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 70, isTaxClaimable: true, explanation: "Mobile phone — typical business split", priority: 30 },
  { merchantMatch: "Vodafone", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 70, isTaxClaimable: true, explanation: "Mobile phone — typical business split", priority: 30 },
  { merchantMatch: "O2 ", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 70, isTaxClaimable: true, explanation: "Mobile phone — typical business split", priority: 30 },
  { merchantMatch: "Three ", matchType: "contains", hmrcCategory: "office_costs", businessPercent: 70, isTaxClaimable: true, explanation: "Mobile phone — typical business split", priority: 30 },
  { merchantMatch: "BT ", matchType: "contains", hmrcCategory: "premises", businessPercent: 50, isTaxClaimable: true, explanation: "Broadband — dual-use WFH split", priority: 30 },
  { merchantMatch: "Virgin Media", matchType: "contains", hmrcCategory: "premises", businessPercent: 50, isTaxClaimable: true, explanation: "Broadband — dual-use WFH split", priority: 30 },
  { merchantMatch: "British Gas", matchType: "contains", hmrcCategory: "premises", businessPercent: 0, isTaxClaimable: false, explanation: "Use simplified WFH expenses or calculate business proportion", priority: 30 },
  { merchantMatch: "Octopus Energy", matchType: "contains", hmrcCategory: "premises", businessPercent: 0, isTaxClaimable: false, explanation: "Use simplified WFH expenses or calculate business proportion", priority: 30 },
  { merchantMatch: "Monzo Pot", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Internal pot transfer — excluded", priority: 1 },
  { merchantMatch: "pot_", matchType: "contains", hmrcCategory: "non_deductible", businessPercent: 0, isTaxClaimable: false, explanation: "Internal pot transfer — excluded", priority: 1 },
];
