const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function twoDigitToWords(num: number): string {
  if (num === 0) return '';
  if (num < 20) return ONES[num];
  const ten = Math.floor(num / 10);
  const one = num % 10;
  return `${TENS[ten]}${one > 0 ? ' ' + ONES[one] : ''}`;
}

function threeDigitToWords(num: number): string {
  let str = '';
  const hundred = Math.floor(num / 100);
  const rem = num % 100;
  if (hundred > 0) {
    str += `${ONES[hundred]} Hundred`;
    if (rem > 0) str += ' ';
  }
  if (rem > 0) {
    str += twoDigitToWords(rem);
  }
  return str;
}

/**
 * Converts a numerical currency value into formal Indian Rupees wording
 * Format: "Rupees Twelve Thousand Four Hundred Fifty Only"
 * Handles Lakhs (1,00,000) and Crores (1,00,00,000) correctly.
 */
export function numberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === 0) {
    return 'Rupees Zero Only';
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  
  const rupees = Math.floor(absAmount);
  const paise = Math.round((absAmount - rupees) * 100);

  if (rupees === 0 && paise === 0) {
    return 'Rupees Zero Only';
  }

  let result = '';

  if (rupees > 0) {
    let n = rupees;
    const parts: string[] = [];

    // Crores (>= 1,00,00,000)
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    if (crore > 0) {
      parts.push(`${numberToIndianWordsInternal(crore)} Crore`);
    }

    // Lakhs (>= 1,00,000)
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    if (lakh > 0) {
      parts.push(`${twoDigitToWords(lakh)} Lakh`);
    }

    // Thousands (>= 1,000)
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (thousand > 0) {
      parts.push(`${twoDigitToWords(thousand)} Thousand`);
    }

    // Hundreds and below (1 to 999)
    if (n > 0) {
      parts.push(threeDigitToWords(n));
    }

    result = parts.join(' ');
  }

  let finalStr = '';
  if (rupees > 0) {
    finalStr = `Rupees ${result}`;
  }

  if (paise > 0) {
    const paiseWord = twoDigitToWords(paise);
    if (rupees > 0) {
      finalStr += ` and ${paiseWord} Paise`;
    } else {
      finalStr = `${paiseWord} Paise`;
    }
  }

  finalStr += ' Only';

  return isNegative ? `Minus ${finalStr}` : finalStr;
}

function numberToIndianWordsInternal(num: number): string {
  if (num < 100) return twoDigitToWords(num);
  return threeDigitToWords(num);
}
