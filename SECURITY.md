# Security Policy

TaxStat360 handles sensitive taxpayer data: business financials, K-1 income, EIN, and personal tax figures. We take reports of security vulnerabilities seriously and appreciate responsible disclosure.

## Supported Versions

TaxStat360 is a continuously-deployed web application. Only the current production deployment on the master branch is supported. There are no older versions maintained separately.

## Reporting a Vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

The preferred way to report is GitHub's private vulnerability reporting feature for this repository, found under the Security tab. Alternatively, email support@taxstat360.com with the subject line Security Report, including a description of the issue, steps to reproduce, and potential impact if known.

We aim to acknowledge reports within 2 business days and to provide a status update or resolution timeline within 5 business days. Please give us a reasonable amount of time to investigate and remediate a report before any public disclosure.

## Scope

In scope: the TaxStat360 web application at app.taxstat360.com and www.taxstat360.com, and this repository.

Out of scope: third-party services we integrate with, including Stripe, AWS, QuickBooks, Xero, Wave, FreshBooks, and Anthropic. Please report issues in those services directly to their respective security teams.

## Our Commitment

We will not pursue legal action against security researchers who report vulnerabilities in good faith, make a reasonable effort to avoid privacy violations and service disruption, and do not access or modify user data beyond what is necessary to demonstrate the issue.
