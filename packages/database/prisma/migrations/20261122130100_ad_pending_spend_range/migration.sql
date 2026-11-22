-- O gasto a lançar passa a acumular até o fechamento (a cada R$ 1,00 gasto e de hora em hora), então não há teto de 1.000.
ALTER TABLE "ad_accounts" DROP CONSTRAINT "ad_accounts_pending_spend_range";
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_pending_spend_non_negative" CHECK ("pending_spend_millicents" >= 0);
