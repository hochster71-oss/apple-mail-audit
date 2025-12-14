# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - main [ref=e3]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - heading "Sign in" [level=3] [ref=e8]
          - paragraph [ref=e9]: Use the seeded demo account after running pnpm db:seed.
        - generic [ref=e10]:
          - generic [ref=e11]:
            - generic [ref=e12]:
              - text: Email
              - textbox "Email" [ref=e13]
            - generic [ref=e14]:
              - text: Password
              - textbox "Password" [ref=e15]
            - button "Sign in" [ref=e16] [cursor=pointer]
          - link "Back to dashboard" [ref=e18] [cursor=pointer]:
            - /url: /
    - contentinfo [ref=e19]:
      - generic [ref=e20]: Developed by Michael Hoch
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e26] [cursor=pointer]:
    - img [ref=e27]
  - alert [ref=e30]
```