-- One sales source per day: the All Orders file when that day has one, otherwise Nineyard.
CREATE OR REPLACE VIEW sales_daily_best AS
WITH day_source AS (
  SELECT sale_date, MIN(CASE source WHEN 'all_orders' THEN 1 ELSE 2 END) AS rank
  FROM sales_daily GROUP BY sale_date
)
SELECT s.sale_date, s.asin, s.units, s.sales, s.orders, s.source
FROM sales_daily s
JOIN day_source d ON d.sale_date = s.sale_date
 AND d.rank = CASE s.source WHEN 'all_orders' THEN 1 ELSE 2 END;
