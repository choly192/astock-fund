export enum SortType {
  NORMAL = 0,
  ASC = 1,
  DESC = -1,
}

export interface StockInfo {
  id?: string;
  groupIndex?: number;
  name: string;
  code: string;
  percent: string;
  contextValue?: 'stock' | 'nodata' | 'stockGroup';
  symbol?: string;
  type?: string;
  yestclose?: string | number;
  open?: string | number;
  high?: string | number;
  low?: string | number;
  time?: string;
  updown?: string;
  price?: string;
  volume?: string;
  amount?: string | number;
  afterPrice?: string;
  afterPercent?: string;
  stale?: boolean;
  fetchedAt?: number;
  source?: string;
}

export interface StockGroupConfig {
  names: string[];
  lists: string[][];
}

export interface FundInfo {
  id?: string;
  groupIndex?: number;
  name: string;
  code: string;
  netValue: string;
  cumulativeNetValue?: string;
  percent: string;
  date?: string;
  fundType?: string;
  contextValue?: 'fund' | 'fundNoData' | 'fundGroup';
  type?: 'fund' | 'nodata';
  stale?: boolean;
  fetchedAt?: number;
  source?: string;
}

export interface FundTrendPoint {
  timestamp: number;
  value: number;
  dailyReturn?: number;
}

export interface FundHistory {
  code: string;
  name: string;
  netWorthTrend: FundTrendPoint[];
  cumulativeReturnTrend: FundTrendPoint[];
  returns: {
    oneMonth?: string;
    threeMonths?: string;
    sixMonths?: string;
    oneYear?: string;
  };
}

export interface FundGroupConfig {
  names: string[];
  lists: string[][];
}
