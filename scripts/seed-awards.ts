import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const awardsData = [
  {
    name: 'Caldecott',
    description:
      'The Caldecott Medal was named in honor of nineteenth-century English illustrator Randolph Caldecott. It is awarded annually by the Association for Library Service to Children, a division of the American Library Association, to the artist of the most distinguished American picture book for children.',
    imagePath: '/images/awards/caldecott.png',
  },
  {
    name: 'Theodor Seuss Geisel',
    description:
      'The Theodor Seuss Geisel Award is given annually to the author(s) and illustrator(s) of the most distinguished American book for beginning readers published in English in the United States during the preceding year.   The winner(s), recognized for their literary and artistic achievements that demonstrate creativity and imagination to engage children in reading, receives a bronze medal.  Honor Book authors and illustrators receive certificates, which are presented at the ALA Annual Conference.  The award was established in 2004 and first presented in 2006.\n\n    The award is named for the world-renowned children\'s author, Theodor Geisel. "A person\'s a person no matter how small," Theodor Geisel, a.k.a. Dr. Seuss, would say. "Children want the same things we want: to laugh, to be challenged, to be entertained and delighted." Brilliant and playful, Dr. Seuss charmed his way into the consciousness of four generations of youngsters and parents. In the process, he helped them to read.',
    imagePath: '/images/awards/theodor-seuss-geisel.png',
  },
  {
    name: 'Ezra Jack Keats',
    description:
      "The Ezra Jack Keats Award was created to nurture illustrators and writers, early in their careers, who create extraordinary books that reflect our diverse population, the universal experience of childhood and the strength of family and community. Over the years the EJK has succeeded in fostering the early careers of many of our country's leading children's book makers.",
    imagePath: '/images/awards/ezra-jack-keats.png',
  },
  {
    name: 'Pura Belpré',
    description:
      'The Pura Belpré Award, established in 1996, is presented to a Latino/Latina writer and illustrator whose work best portrays, affirms, and celebrates the Latino cultural experience in an outstanding work of literature for children and youth.',
    imagePath: '/images/awards/pura-belpre.png',
  },
  {
    name: 'Sibert',
    description:
      'The Robert F. Sibert Informational Book Medal is awarded annually to the author(s) and illustrator(s) of the most distinguished informational book published in the United States in English during the preceding year. The award is named in honor of Robert F. Sibert, the long-time President of Bound to Stay Bound Books, Inc. of Jacksonville, Illinois.',
    imagePath: '/images/awards/sibert.png',
  },
  {
    name: 'Newbery',
    description:
      'The Newbery Medal was named for eighteenth-century British bookseller John Newbery. It is awarded annually by the Association for Library Service to Children, a division of the American Library Association, to the author of the most distinguished contribution to American literature for children.',
    imagePath: '/images/awards/newbery.png',
  },
]

async function main() {
  const convexUrl = process.env.CONVEX_URL

  if (!convexUrl) {
    console.error('❌ CONVEX_URL environment variable is not set')
    process.exit(1)
  }

  const client = new ConvexHttpClient(convexUrl)

  console.log('🌱 Seeding awards data...')
  console.log(`   Found ${awardsData.length} awards to seed\n`)

  let created = 0
  let updated = 0

  for (const award of awardsData) {
    // Images are now in public folder, use local path
    const imageSourceUrl = award.imagePath

    try {
      const result = await client.mutation(api.awards.mutations.upsertByName, {
        name: award.name,
        description: award.description,
        imageSourceUrl,
      })

      if (result.isNew) {
        created++
        console.log(`✅ Created: ${award.name}`)
      } else {
        updated++
        console.log(`📝 Updated: ${award.name}`)
      }
    } catch (error) {
      console.error(`❌ Error seeding ${award.name}:`, error)
    }
  }

  console.log(`\n🎉 Seeding complete!`)
  console.log(`   Created: ${created}`)
  console.log(`   Updated: ${updated}`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
