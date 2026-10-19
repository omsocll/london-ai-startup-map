# London startup location verification - 2026-05-05

## Decision rule

Use exact map pins only when a public source gives a street-level company address. If the only evidence is a Companies House or legal address, keep the pin but label it as `registered_office`. If no public street-level evidence exists, keep the startup at a neighbourhood cluster and label it as `area_estimate`.

## Applied updates

| Startup | Previous area | Updated area | Basis | Source |
| --- | --- | --- | --- | --- |
| Fyxer AI | Holborn / Chancery Lane | Holborn / Chancery Lane | Registered UK address at Chancery House, 53-64 Chancery Lane | https://www.fyxer.com/for-ai-assistants |
| Compass Labs | Shoreditch / Old Street | Old Street / City Road | Registered/legal address at 128 City Road | https://docs.compasslabs.ai/v1/support/privacy-policy |
| Arda Biomaterials | White City / West London | Southwark / Bermondsey | Published company contact address at 64-66 Gedling Place | https://arda.bio/contact |
| HelmGuard AI | Shoreditch / Old Street | Fitzrovia / Great Portland Street | Published HQ listing at 167-169 Great Portland Street | https://www.signalhire.com/companies/helmguard-ai |
| Genie Fertility | King's Cross / Euston | Euston / Drummond Street | Companies House registered office at 192 Drummond Street, with conflicting Harley Street directory data | https://find-and-update.company-information.service.gov.uk/company/15880325 |
| Assuric | City of London | Hoxton / Angel | Public registered-office record at 20 Wenlock Road; official site only shows email contact | https://www.companiesintheuk.co.uk/ltd/assuric-inc |

## Important caveat

Most startups in the current 60-company dataset do not publish street-level operating locations. The app now marks those as `area_estimate` instead of presenting broad cluster pins as verified office coordinates.

## Recommended next data pass

Run a second enrichment pass against LinkedIn company pages, Dealroom/Beauhurst-style profiles, and official contact/legal pages. Only promote a startup to `exact` when the source is an official contact page or a strong company-profile source that clearly says HQ/headquarters.
