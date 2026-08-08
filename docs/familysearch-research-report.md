# FamilySearch manual matching report

Research completed 2026-08-08 for Health Tracker profile `cmmtsg1wq0001dcvbaiyt0jqh`.

## Outcome

- People reviewed: 269
- FamilySearch identities linked: 121
- Remaining unlinked: 148
- Unlinked people with complete local birth and death dates: 119
- Unlinked people with an incomplete local birth/death record: 29
- FamilySearch requests left failed or throttled: 0

Every profile member received a successful public FamilySearch search or was reviewed through a verified FamilySearch family graph. Links were made only when exact vital dates or corroborating parents, spouses, siblings, or children made the identity clear. A lack of a unique public result was not treated as permission to guess.

## Matching passes

1. Exact normalized name plus exact full birth and death dates.
2. First-name/surname search with a unique exact birth-and-death result, allowing middle-name and spelling variants.
3. Family-graph traversal from 95 verified profiles, comparing parents, spouses, siblings, and children.
4. Individual retry of every throttled lookup; all retries ultimately completed.
5. Individual birth-date search for all records missing a death date (or birth date), with no automatic linking of potentially living people.

## Deliberately unresolved cases

- `Leonard Jorgensen`: the local record has neither a birth nor death date. FamilySearch returned 11 plausible published profiles, including a separate already-linked `Leonard Nielsen Jorgensen`; there is not enough evidence to choose another ID.
- `Larkins (daughter A, b. abt 1902)` and `Larkins (daughter B, b. abt 1902)`: FamilySearch has two unnamed daughters of the same parents, both born approximately 1902 (`MN86-CC1` and `KZPB-8S4`). The records cannot be assigned A-versus-B without guessing.
- Modern records without a death date (including David Phillips and other likely living relatives): no public published match was linked from name and birthday alone.
- The other 119 complete-date records produced no unique result matching the local birth and death dates. They remain unlinked for future source-assisted or authenticated FamilySearch research.

## Notable relationship-based resolution

`Geneva Larkins` (`K873-17H`) was verified by exact name and birth date plus the same parents, Porter Larkins and Sara Elizabeth Sims, and the same sibling group. That graph also resolved the approximate-date records for Ethel Larkins, Porter Larkins, Sara Elizabeth Sims, Harm or Hyrum Larkins, Effie Larkins, and Opal H. Larkin.

## Technical note

The deployed Health Tracker backend did not have `FAMILYSEARCH_CLIENT_ID`, so authenticated matching could not run. Research used FamilySearch's public published-person search and family graph. Public results omit or obscure many living people, and authenticated research may find additional records later.
