import type { Expense, Homemate } from '../types';

export interface DebtSuggestion {
  debtorId: string;
  creditorId: string;
  amount: number;
}

export function calculateBalances(expenses: Expense[], homemates: Homemate[]): Record<string, number> {
  const balances: Record<string, number> = {};

  // Initialize balances for all members
  homemates.forEach(m => {
    balances[m.id] = 0;
  });

  // Calculate net balances based on expenses
  expenses.forEach(exp => {
    const payer = exp.payerId;
    const amount = exp.amount;

    // Add total amount to payer
    balances[payer] = (balances[payer] || 0) + amount;

    // Subtract shares from each user
    Object.entries(exp.shares).forEach(([userId, shareAmount]) => {
      balances[userId] = (balances[userId] || 0) - shareAmount;
    });
  });

  return balances;
}

export function getOptimizedDebts(expenses: Expense[], homemates: Homemate[]): DebtSuggestion[] {
  const balances = calculateBalances(expenses, homemates);

  // Separate debtors and creditors
  const debtors = Object.entries(balances)
    .filter(([_, bal]) => bal < -0.01)
    .map(([id, bal]) => ({ id, balance: -bal }));

  const creditors = Object.entries(balances)
    .filter(([_, bal]) => bal > 0.01)
    .map(([id, bal]) => ({ id, balance: bal }));

  const optimized: DebtSuggestion[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const transferAmount = Math.min(debtor.balance, creditor.balance);
    if (transferAmount > 0.01) {
      optimized.push({
        debtorId: debtor.id,
        creditorId: creditor.id,
        amount: Number(transferAmount.toFixed(2))
      });
    }

    debtor.balance -= transferAmount;
    creditor.balance -= transferAmount;

    if (debtor.balance < 0.01) i++;
    if (creditor.balance < 0.01) j++;
  }

  return optimized;
}
